import type { Bot, Context, MiddlewareFn } from "grammy";

import { findEnabledPairByTarget } from "../../db/chatPairs.js";
import { localeForChat } from "../../db/chatSettings.js";
import type { AppDb } from "../../db/client.js";
import { findThread, listRecentThreads } from "../../db/relocation.js";
import { withLocale } from "../../i18n.js";
import { contentFingerprint } from "../../lib/fingerprint.js";
import {
  mediaUniqueIds,
  messageCaption,
  messageText,
} from "../../lib/telegramMessage.js";
import type { Logger } from "../../logger.js";
import { ForwardBatcher, BATCH_WINDOW_MS } from "./batcher.js";
import { parseRelocateCallback, renderDraftPrompt } from "./confirm.js";
import {
  RelocationDraftStore,
  draftKey,
  mergeForwards,
  type RelocationDraft,
} from "./drafts.js";
import { readForwardOrigin } from "./match.js";
import {
  discardRelocation,
  executeRelocation,
  failRelocation,
  matchRelocation,
  type PendingForward,
  type RelocateDeps,
} from "./run.js";
import {
  renderConfirmExpired,
  renderNoRecentThreads,
  renderOnlyForwarder,
  renderThreadUnavailable,
} from "./templates.js";

const controllers = new WeakMap<Bot, ForwardBatcher<PendingForward>>();

export { BATCH_WINDOW_MS };

const HTML_OPTIONS = {
  parse_mode: "HTML" as const,
  link_preview_options: { is_disabled: true },
};

export function flushRelocate(bot: Bot): Promise<void> {
  return controllers.get(bot)?.flushAll() ?? Promise.resolve();
}

export function stopRelocate(bot: Bot): void {
  controllers.get(bot)?.stop();
}

function chatTitle(chat: NonNullable<Context["chat"]>): string | null {
  if ("title" in chat && chat.title) return chat.title;
  return null;
}

function chatUsername(chat: NonNullable<Context["chat"]>): string | null {
  if ("username" in chat && chat.username) return chat.username;
  return null;
}

/** Schedule Flow A when a non-bot user forwards into a linked target chat. */
export function registerRelocate(
  bot: Bot,
  db: AppDb,
  logger: Logger,
  drafts: RelocationDraftStore,
  batchWindowMs: number = BATCH_WINDOW_MS,
): MiddlewareFn<Context> {
  const deps: RelocateDeps = { db, api: bot.api, logger };
  const seen = new Set<string>();
  const batcher = new ForwardBatcher<PendingForward>({
    windowMs: batchWindowMs,
    onBatch: async (items) => {
      const fresh = items.filter((item) => {
        const id = `${item.targetChatId}:${item.triggerMessageId}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      if (fresh.length === 0 || !fresh[0]) return;
      const head = fresh[0];
      try {
        await drafts.runExclusive(head.targetChatId, head.moderatorUserId, () =>
          acceptBatch(deps, drafts, fresh),
        );
      } catch (err) {
        logger.error({ err }, "relocation batch failed");
      }
    },
  });
  controllers.set(bot, batcher);

  bot.callbackQuery(/^reloc:/, async (ctx) => {
    const data = ctx.callbackQuery.data;
    const parsed = parseRelocateCallback(data);
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!parsed || chatId == null || userId == null) {
      await ctx.answerCallbackQuery();
      return;
    }
    const draft = drafts.getById(parsed.draftId);
    const lockChat = draft?.targetChatId ?? chatId;
    const lockUser = draft?.moderatorUserId ?? userId;
    try {
      await drafts.runExclusive(lockChat, lockUser, async () => {
        const current = drafts.getById(parsed.draftId);
        if (!current || current.targetChatId !== chatId) {
          await ctx.answerCallbackQuery({
            text: withLocale(await localeForChat(db, chatId), () => renderConfirmExpired()),
          });
          return;
        }
        if (userId !== current.moderatorUserId) {
          await ctx.answerCallbackQuery({
            text: withLocale(await localeForChat(db, chatId), () => renderOnlyForwarder()),
          });
          return;
        }
        await handleChoice(ctx, deps, drafts, current, parsed);
      });
    } catch (err) {
      logger.error({ err }, "relocation choice failed");
      try {
        await ctx.answerCallbackQuery();
      } catch {
        // The query may already have been answered.
      }
    }
  });

  return async (ctx, next) => {
    try {
      const msg = ctx.message;
      if (msg && ctx.chat && msg.from && !msg.from.is_bot && msg.forward_origin) {
        const pair = await findEnabledPairByTarget(db, ctx.chat.id);
        if (pair) {
          const pending: PendingForward = {
            targetChatId: ctx.chat.id,
            targetTitle: chatTitle(ctx.chat),
            targetUsername: chatUsername(ctx.chat),
            moderatorUserId: msg.from.id,
            triggerMessageId: msg.message_id,
            text: messageText(msg),
            caption: messageCaption(msg),
            fingerprint: contentFingerprint({
              text: messageText(msg),
              caption: messageCaption(msg),
              mediaUniqueIds: mediaUniqueIds(msg),
            }),
            origin: readForwardOrigin(msg.forward_origin),
          };
          batcher.push(draftKey(ctx.chat.id, msg.from.id), pending);
        }
      } else if (msg && ctx.chat && msg.from && !msg.from.is_bot) {
        const text = (messageText(msg) ?? "").trim();
        if (text && !text.startsWith("/")) {
          await drafts.runExclusive(ctx.chat.id, msg.from.id, async () => {
            const draft = drafts.getByKey(ctx.chat!.id, msg.from!.id);
            if (!draft || draft.step !== "title") return;
            drafts.delete(draft);
            await executeRelocation(deps, draft.plan, {
              promptMessageId: draft.promptMessageId ?? undefined,
              titleMessageId: msg.message_id,
              customTitle: text,
            });
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "relocate schedule failed");
    }
    await next();
  };
}

async function acceptBatch(
  deps: RelocateDeps,
  drafts: RelocationDraftStore,
  fresh: PendingForward[],
): Promise<void> {
  const head = fresh[0];
  if (!head) return;
  const open = drafts.getByKey(head.targetChatId, head.moderatorUserId);
  const items = open ? mergeForwards(open.plan.items, fresh) : fresh;
  const matched = await matchRelocation(deps, items);
  if (!matched.ok) {
    if (open) {
      await deletePrompt(deps, open);
      drafts.delete(open);
    }
    if (matched.pair) await failRelocation(deps, matched.pair, items);
    return;
  }
  if (open) {
    open.plan = matched.plan;
    await publishDraft(deps, open);
    return;
  }
  const draft = drafts.create({
    targetChatId: head.targetChatId,
    moderatorUserId: head.moderatorUserId,
    plan: matched.plan,
  });
  try {
    await publishDraft(deps, draft);
  } catch (err) {
    drafts.delete(draft);
    throw err;
  }
}

async function handleChoice(
  ctx: Context,
  deps: RelocateDeps,
  drafts: RelocationDraftStore,
  draft: RelocationDraft,
  parsed: NonNullable<ReturnType<typeof parseRelocateCallback>>,
): Promise<void> {
  const locale = await localeForChat(deps.db, draft.targetChatId);
  if (parsed.action === "attach") {
    const threads = await listRecentThreads(deps.db, draft.targetChatId, 5);
    if (threads.length === 0) {
      await ctx.answerCallbackQuery({
        text: withLocale(locale, () => renderNoRecentThreads()),
        show_alert: true,
      });
      return;
    }
    draft.step = "pick";
    await ctx.answerCallbackQuery();
    await publishDraft(deps, draft, threads);
    return;
  }
  if (parsed.action === "title") {
    draft.step = "title";
    await ctx.answerCallbackQuery();
    await publishDraft(deps, draft);
    return;
  }
  if (parsed.action === "pick") {
    const thread = await findThread(deps.db, parsed.threadId);
    if (!thread || thread.targetChatId !== draft.targetChatId) {
      await ctx.answerCallbackQuery({
        text: withLocale(locale, () => renderThreadUnavailable()),
      });
      return;
    }
    drafts.delete(draft);
    await ctx.answerCallbackQuery();
    await executeRelocation(deps, draft.plan, {
      promptMessageId: draft.promptMessageId ?? undefined,
      existingThread: thread,
    });
    return;
  }
  if (parsed.action === "drop") {
    await ctx.answerCallbackQuery();
    const removed = await discardRelocation(deps, draft.plan, draft.promptMessageId);
    if (removed) drafts.delete(draft);
    return;
  }
  drafts.delete(draft);
  await ctx.answerCallbackQuery();
  await executeRelocation(deps, draft.plan, {
    promptMessageId: draft.promptMessageId ?? undefined,
  });
}

async function publishDraft(
  deps: RelocateDeps,
  draft: RelocationDraft,
  threads: Awaited<ReturnType<typeof listRecentThreads>> = [],
): Promise<void> {
  const locale = await localeForChat(deps.db, draft.targetChatId);
  const recent =
    draft.step === "pick" && threads.length === 0
      ? await listRecentThreads(deps.db, draft.targetChatId, 5)
      : threads;
  if (draft.step === "pick" && recent.length === 0) draft.step = "confirm";
  const view = withLocale(locale, () => renderDraftPrompt(draft, recent));
  await deletePrompt(deps, draft);
  const sent = await deps.api.sendMessage(draft.targetChatId, view.text, {
    ...HTML_OPTIONS,
    reply_markup: view.reply_markup,
  });
  draft.promptMessageId = sent.message_id;
}

async function deletePrompt(deps: RelocateDeps, draft: RelocationDraft): Promise<void> {
  if (draft.promptMessageId == null) return;
  const messageId = draft.promptMessageId;
  try {
    await deps.api.deleteMessage(draft.targetChatId, messageId);
  } catch (err) {
    deps.logger.error(
      { err, chatId: draft.targetChatId, messageId },
      "failed to delete relocate prompt",
    );
  }
}
