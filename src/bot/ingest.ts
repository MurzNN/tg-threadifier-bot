import type { Context, MiddlewareFn } from "grammy";

import { listEnabledPairs } from "../db/chatPairs.js";
import type { AppDb } from "../db/client.js";
import { upsertMessage } from "../db/messages.js";
import { contentFingerprint } from "../lib/fingerprint.js";
import type { Logger } from "../logger.js";

type IngestMessage = NonNullable<Context["message"] | Context["channelPost"]>;

function mediaUniqueIds(msg: IngestMessage): string[] {
  const ids: string[] = [];
  const push = (id?: string) => {
    if (id) ids.push(id);
  };
  push(msg.photo?.at(-1)?.file_unique_id);
  push(msg.animation?.file_unique_id);
  push(msg.audio?.file_unique_id);
  push(msg.document?.file_unique_id);
  push(msg.sticker?.file_unique_id);
  push(msg.video?.file_unique_id);
  push(msg.video_note?.file_unique_id);
  push(msg.voice?.file_unique_id);
  return ids;
}

function forwardOriginJson(msg: IngestMessage): string | null {
  const origin =
    "forward_origin" in msg
      ? (msg as { forward_origin?: unknown }).forward_origin
      : undefined;
  if (!origin) return null;
  try {
    return JSON.stringify(origin);
  } catch {
    return null;
  }
}

/** Persist inbound messages for chats that belong to an enabled pair. */
export function createIngestMiddleware(
  db: AppDb,
  logger: Logger,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const msg = ctx.message ?? ctx.channelPost;
    if (!msg || !ctx.chat) {
      await next();
      return;
    }

    const pairs = await listEnabledPairs(db);
    const watched = new Set<number>();
    for (const pair of pairs) {
      watched.add(pair.sourceChatId);
      watched.add(pair.targetChatId);
    }
    if (!watched.has(ctx.chat.id)) {
      await next();
      return;
    }

    try {
      await upsertMessage(db, {
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        fromUserId: msg.from?.id ?? null,
        date: msg.date,
        text: "text" in msg ? (msg.text ?? null) : null,
        caption: "caption" in msg ? (msg.caption ?? null) : null,
        contentFingerprint: contentFingerprint({
          text: "text" in msg ? msg.text : null,
          caption: "caption" in msg ? msg.caption : null,
          mediaUniqueIds: mediaUniqueIds(msg),
        }),
        replyToMessageId: msg.reply_to_message?.message_id ?? null,
        forwardOrigin: forwardOriginJson(msg),
        raw: msg,
      });
    } catch (err) {
      logger.error(
        { err, chatId: ctx.chat.id, messageId: msg.message_id },
        "ingest upsert failed",
      );
    }

    await next();
  };
}
