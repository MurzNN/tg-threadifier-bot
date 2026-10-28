import type { Context, MiddlewareFn } from "grammy";

import { listEnabledPairs } from "../db/chatPairs.js";
import type { AppDb } from "../db/client.js";
import { upsertMessage } from "../db/messages.js";
import { contentFingerprint } from "../lib/fingerprint.js";
import {
  mediaUniqueIds,
  messageCaption,
  messageText,
  serializeForwardOrigin,
} from "../lib/telegramMessage.js";
import type { Logger } from "../logger.js";

/** Persist inbound messages for chats that belong to an enabled pair. */
export function createIngestMiddleware(
  db: AppDb,
  logger: Logger,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const msg =
      ctx.message ??
      ctx.editedMessage ??
      ctx.channelPost ??
      ctx.editedChannelPost;
    if (!msg || !ctx.chat) {
      logger.debug(
        { updateId: ctx.update.update_id },
        "ingest skipped: update has no message",
      );
      await next();
      return;
    }

    const pairs = await listEnabledPairs(db);
    const watchedChatIds = [
      ...new Set(pairs.flatMap((pair) => [pair.sourceChatId, pair.targetChatId])),
    ];
    if (!watchedChatIds.includes(ctx.chat.id)) {
      logger.debug(
        {
          chatId: ctx.chat.id,
          messageId: msg.message_id,
          watchedChatIds,
        },
        "ingest skipped: chat is not in an enabled pair",
      );
      await next();
      return;
    }

    try {
      await upsertMessage(db, {
        chatId: ctx.chat.id,
        messageId: msg.message_id,
        fromUserId: msg.from?.id ?? null,
        date: msg.date,
        text: messageText(msg),
        caption: messageCaption(msg),
        contentFingerprint: contentFingerprint({
          text: messageText(msg),
          caption: messageCaption(msg),
          mediaUniqueIds: mediaUniqueIds(msg),
        }),
        replyToMessageId: msg.reply_to_message?.message_id ?? null,
        forwardOrigin: serializeForwardOrigin(msg),
        raw: msg,
      });
    } catch (err) {
      logger.error(
        { err, chatId: ctx.chat.id, messageId: msg.message_id },
        "ingest upsert failed",
      );
      await next();
      return;
    }

    logger.debug(
      { chatId: ctx.chat.id, messageId: msg.message_id },
      "ingest stored message",
    );
    await next();
  };
}
