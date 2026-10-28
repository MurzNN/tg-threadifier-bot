import type { Bot, Context, MiddlewareFn } from "grammy";

import { findEnabledPairByTarget } from "../../db/chatPairs.js";
import type { AppDb } from "../../db/client.js";
import { contentFingerprint } from "../../lib/fingerprint.js";
import {
  mediaUniqueIds,
  messageCaption,
  messageText,
} from "../../lib/telegramMessage.js";
import type { Logger } from "../../logger.js";
import { ForwardBatcher, BATCH_WINDOW_MS } from "./batcher.js";
import { readForwardOrigin } from "./match.js";
import { relocateBatch, type PendingForward } from "./run.js";

const controllers = new WeakMap<Bot, ForwardBatcher<PendingForward>>();

export { BATCH_WINDOW_MS };

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
  batchWindowMs: number = BATCH_WINDOW_MS,
): MiddlewareFn<Context> {
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
      if (fresh.length === 0) return;
      try {
        await relocateBatch({ db, api: bot.api, logger }, fresh);
      } catch (err) {
        logger.error({ err }, "relocation batch failed");
      }
    },
  });
  controllers.set(bot, batcher);

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
          batcher.push(`${ctx.chat.id}:${msg.from.id}`, pending);
        }
      }
    } catch (err) {
      logger.error({ err }, "relocate schedule failed");
    }
    await next();
  };
}
