import type { Api } from "grammy";
import type { MessageEntity } from "grammy/types";

import type { ChatPair } from "../../db/chatPairs.js";
import { findEnabledPairByTarget } from "../../db/chatPairs.js";
import type { AppDb } from "../../db/client.js";
import {
  findMessage,
  findMessagesByContent,
  type StoredMessage,
} from "../../db/messages.js";
import {
  insertRelocationJob,
  insertThread,
  updateRelocationJob,
  type RelocationPayload,
  type RelocationPhase,
} from "../../db/relocation.js";
import { buildMessageLink, buildThreadLink, buildUserLink } from "../../lib/links.js";
import type { Logger } from "../../logger.js";
import {
  appendAuthorSuffix,
  MESSAGE_CAPTION_MAX,
  MESSAGE_TEXT_MAX,
  messageSupportsCaption,
  readMessageEntities,
} from "./authorSuffix.js";
import { matchForward, type ForwardOriginInfo } from "./match.js";
import {
  authorLabel,
  renderMatchFailure,
  renderRelocateAborted,
  renderSourceNotice,
  renderThreadHeader,
  resolveRootTitles,
  sourceChatLabel,
  targetChatLabel,
} from "./templates.js";

export type PendingForward = {
  targetChatId: number;
  targetTitle: string | null;
  targetUsername: string | null;
  moderatorUserId: number;
  triggerMessageId: number;
  text: string | null;
  caption: string | null;
  fingerprint: string;
  origin: ForwardOriginInfo | null;
};

type RelocateApi = Pick<
  Api,
  | "sendMessage"
  | "editMessageText"
  | "editMessageCaption"
  | "copyMessage"
  | "deleteMessages"
>;

const HTML_OPTIONS = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true },
};

type ResolvedItem = {
  message: StoredMessage;
  triggerMessageId: number;
  authorName: string;
};

function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 500);
}

async function notify(
  api: RelocateApi,
  chatId: number,
  text: string,
  logger: Logger,
): Promise<void> {
  try {
    await api.sendMessage(chatId, text);
  } catch (err) {
    logger.error({ err, chatId }, "failed to send relocate notice");
  }
}

async function deleteIds(
  api: RelocateApi,
  chatId: number,
  ids: number[],
): Promise<void> {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 100) {
    const slice = sorted.slice(i, i + 100);
    if (slice.length > 0) await api.deleteMessages(chatId, slice);
  }
}

/** Copy one non-root message into the thread and append its original author. */
async function emitReply(
  api: RelocateApi,
  pair: ChatPair,
  item: ResolvedItem,
  headerMessageId: number,
): Promise<void> {
  const copied = await api.copyMessage(
    pair.targetChatId,
    pair.sourceChatId,
    item.message.messageId,
    { reply_parameters: { message_id: headerMessageId } },
  );
  const userId = item.message.fromUserId;
  if (item.message.text != null) {
    const authored = appendAuthorSuffix({
      body: item.message.text,
      authorName: item.authorName,
      userId,
      maxLength: MESSAGE_TEXT_MAX,
      entities: readMessageEntities(item.message.raw, "entities"),
    });
    await api.editMessageText(pair.targetChatId, copied.message_id, authored.text, {
      entities: authored.entities as unknown as MessageEntity[],
    });
    return;
  }
  if (item.message.caption != null || messageSupportsCaption(item.message.raw)) {
    const authored = appendAuthorSuffix({
      body: item.message.caption ?? "",
      authorName: item.authorName,
      userId,
      maxLength: MESSAGE_CAPTION_MAX,
      entities: readMessageEntities(item.message.raw, "caption_entities"),
    });
    await api.editMessageCaption(pair.targetChatId, copied.message_id, {
      caption: authored.text,
      caption_entities: authored.entities as unknown as MessageEntity[],
    });
  }
}

async function resolveItem(
  db: AppDb,
  sourceChatId: number,
  item: PendingForward,
): Promise<
  | { ok: true; item: ResolvedItem }
  | { ok: false; reason: string; triggerMessageId: number }
> {
  const origin = item.origin;
  const exact =
    origin?.type === "channel" && origin.originMessageId != null
      ? await findMessage(db, sourceChatId, origin.originMessageId)
      : undefined;
  const candidates =
    origin && origin.type !== "channel"
      ? await findMessagesByContent(
          db,
          sourceChatId,
          origin.date,
          item.fingerprint,
        )
      : [];
  const matched = matchForward({
    origin,
    sourceChatId,
    fingerprint: item.fingerprint,
    exact,
    candidates,
  });
  if (!matched.ok) {
    return {
      ok: false,
      reason: matched.reason,
      triggerMessageId: item.triggerMessageId,
    };
  }
  return {
    ok: true,
    item: {
      message: matched.message,
      triggerMessageId: item.triggerMessageId,
      authorName: authorLabel(origin?.authorName),
    },
  };
}

/**
 * Flow A for one grouped batch. Match failures and API errors stop before
 * any delete that has not already succeeded. Copies land in the header's
 * reply thread (`copyMessage` + `reply_parameters`). Text and captions then
 * gain an author suffix. `forwardMessage` cannot target that thread.
 */
export async function relocateBatch(
  deps: { db: AppDb; api: RelocateApi; logger: Logger },
  items: PendingForward[],
): Promise<void> {
  const first = items[0];
  if (!first) return;
  const { db, api, logger } = deps;

  const pair = await findEnabledPairByTarget(db, first.targetChatId);
  if (!pair) {
    logger.warn(
      { targetChatId: first.targetChatId },
      "relocate skipped; no enabled pair for target",
    );
    return;
  }

  const resolved: ResolvedItem[] = [];
  const failures: { triggerMessageId: number; reason: string }[] = [];
  for (const item of items) {
    const result = await resolveItem(db, pair.sourceChatId, item);
    if (result.ok) resolved.push(result.item);
    else {
      failures.push({
        triggerMessageId: result.triggerMessageId,
        reason: result.reason,
      });
    }
  }

  if (failures.length > 0 || resolved.length !== items.length) {
    logger.warn(
      { failures, pairId: pair.id, moderatorUserId: first.moderatorUserId },
      "relocation match failed",
    );
    await insertRelocationJob(db, {
      chatPairId: pair.id,
      phase: "aborted",
      payload: {
        moderatorUserId: first.moderatorUserId,
        sourceChatId: pair.sourceChatId,
        targetChatId: pair.targetChatId,
        triggerMessageIds: items.map((item) => item.triggerMessageId),
        reason: "match_failed",
      },
    });
    await notify(api, pair.targetChatId, renderMatchFailure(), logger);
    return;
  }

  resolved.sort(
    (a, b) =>
      a.message.date - b.message.date ||
      a.message.messageId - b.message.messageId,
  );

  const payload: RelocationPayload = {
    moderatorUserId: first.moderatorUserId,
    sourceChatId: pair.sourceChatId,
    targetChatId: pair.targetChatId,
    items: resolved.map((item) => ({
      sourceMessageId: item.message.messageId,
      triggerMessageId: item.triggerMessageId,
      date: item.message.date,
      fromUserId: item.message.fromUserId,
      text: item.message.text,
      caption: item.message.caption,
      authorName: item.authorName,
    })),
  };

  const job = await insertRelocationJob(db, {
    chatPairId: pair.id,
    phase: "pending",
    payload,
  });

  let phase: RelocationPhase = "pending";
  try {
    await postThread(deps, pair, first, resolved, payload, job.id, (next) => {
      phase = next;
    });
  } catch (err) {
    payload.reason = "api_error";
    payload.error = errorText(err);
    payload.stoppedAt = phase;
    await updateRelocationJob(db, job.id, "aborted", payload);
    logger.warn(
      { err, jobId: job.id, phase, pairId: pair.id },
      "relocation aborted",
    );
    await notify(
      api,
      pair.targetChatId,
      renderRelocateAborted(phase),
      logger,
    );
  }
}

async function postThread(
  deps: { db: AppDb; api: RelocateApi; logger: Logger },
  pair: ChatPair,
  first: PendingForward,
  resolved: ResolvedItem[],
  payload: RelocationPayload,
  jobId: number,
  setPhase: (phase: RelocationPhase) => void,
): Promise<void> {
  const { db, api, logger } = deps;
  const root = resolved[0];
  if (!root) throw new Error("relocation batch has no root");

  const titles = resolveRootTitles(root.message.text, root.message.caption);
  const userId = root.message.fromUserId;
  const linkToUser = userId != null ? buildUserLink(userId) : "https://t.me";
  const sourceName = sourceChatLabel(pair.sourceTitle);
  const targetName = targetChatLabel(pair.targetTitle ?? first.targetTitle);
  const linkToSourceChat = buildMessageLink({
    chatId: pair.sourceChatId,
    messageId: root.message.messageId,
    username: pair.sourceUsernameOrPath,
  });
  const headerVars = {
    threadTitle: titles.threadTitle,
    linkToUser,
    userDisplayName: root.authorName,
    linkToSourceChat,
    sourceChatName: sourceName,
    threadLink: "https://t.me",
  };

  const sent = await api.sendMessage(
    pair.targetChatId,
    renderThreadHeader(headerVars),
    HTML_OPTIONS,
  );
  const headerMessageId = sent.message_id;
  const threadLink = buildThreadLink({
    chatId: pair.targetChatId,
    messageId: headerMessageId,
    username: first.targetUsername,
  });
  await api.editMessageText(
    pair.targetChatId,
    headerMessageId,
    renderThreadHeader({ ...headerVars, threadLink }),
    HTML_OPTIONS,
  );

  await insertThread(db, {
    targetChatId: pair.targetChatId,
    rootMessageId: headerMessageId,
    threadTitle: titles.threadTitle,
    topicLabel: titles.topicLabel,
    titleSource: titles.titleSource,
    initiatorUserId: userId,
  });

  payload.headerMessageId = headerMessageId;
  payload.threadLink = threadLink;
  setPhase("header_created");
  await updateRelocationJob(db, jobId, "header_created", payload);
  logger.info({ jobId, headerMessageId }, "relocation header created");

  // Root text is represented by the header. Other messages are copied into
  // the reply thread in stored chronological order, with the original author
  // appended when the message has text or a caption.
  for (const item of resolved.slice(1)) {
    await emitReply(api, pair, item, headerMessageId);
  }
  setPhase("populated");
  await updateRelocationJob(db, jobId, "populated", payload);

  await deleteIds(
    api,
    pair.targetChatId,
    resolved.map((item) => item.triggerMessageId),
  );
  setPhase("target_cleaned");
  await updateRelocationJob(db, jobId, "target_cleaned", payload);

  await deleteIds(
    api,
    pair.sourceChatId,
    resolved.map((item) => item.message.messageId),
  );
  setPhase("source_cleaned");
  await updateRelocationJob(db, jobId, "source_cleaned", payload);

  await api.sendMessage(
    pair.sourceChatId,
    renderSourceNotice({
      topicLabel: titles.topicLabel,
      linkToUser,
      userDisplayName: root.authorName,
      linkToTargetChatThread: threadLink,
      targetChatName: targetName,
    }),
    HTML_OPTIONS,
  );
  setPhase("completed");
  await updateRelocationJob(db, jobId, "completed", payload);
  logger.info({ jobId, threadLink }, "relocation completed");
}
