import type { Context, MiddlewareFn } from "grammy";
import type { UserFromGetMe } from "grammy/types";

import type { ChatPair } from "../db/chatPairs.js";
import { DEFAULT_DATABASE_URL, isPostgresUrl } from "../db/databaseUrl.js";
import type { Logger } from "../logger.js";

/** Fields safe to log for one inbound update. Message text stays out of the logs. */
export function summarizeUpdate(ctx: Context): Record<string, unknown> {
  const msg =
    ctx.message ??
    ctx.editedMessage ??
    ctx.channelPost ??
    ctx.editedChannelPost;
  const text = msg && "text" in msg ? msg.text : undefined;
  return {
    updateId: ctx.update.update_id,
    updateKeys: Object.keys(ctx.update).filter((key) => key !== "update_id"),
    chatId: ctx.chat?.id,
    chatType: ctx.chat?.type,
    messageId: msg?.message_id,
    fromUserId: msg?.from?.id ?? ctx.from?.id,
    hasText: typeof text === "string",
    hasCaption: Boolean(msg && "caption" in msg && msg.caption),
    hasForwardOrigin: Boolean(msg && "forward_origin" in msg && msg.forward_origin),
    isCommand: typeof text === "string" && text.startsWith("/"),
  };
}

/** Log every update before ingest decides whether to store it. */
export function createUpdateLogMiddleware(logger: Logger): MiddlewareFn<Context> {
  return async (ctx, next) => {
    logger.debug(summarizeUpdate(ctx), "update received");
    await next();
  };
}

/** Host and database name only, so a Postgres URL does not land in the logs. */
export function databaseLogTarget(url: string | undefined): string {
  if (!url) return DEFAULT_DATABASE_URL;
  if (!isPostgresUrl(url)) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "postgres";
  }
}

export function logPollingReady(
  logger: Logger,
  me: UserFromGetMe,
  pairs: readonly Pick<ChatPair, "sourceChatId" | "targetChatId">[],
  databaseUrl: string | undefined,
): void {
  const watchedChatIds = [
    ...new Set(pairs.flatMap((pair) => [pair.sourceChatId, pair.targetChatId])),
  ];
  logger.info(
    {
      username: me.username,
      id: me.id,
      canReadAllGroupMessages: me.can_read_all_group_messages,
      watchedChatIds,
      database: databaseLogTarget(databaseUrl),
    },
    "bot started (long polling)",
  );
  if (!me.can_read_all_group_messages) {
    logger.warn(
      "Privacy mode is on (can_read_all_group_messages is false). In a group where this bot is not an admin, Telegram delivers commands, mentions, and replies to the bot. Ordinary messages never arrive, so ingest cannot store them. Disable privacy in BotFather with /setprivacy, or promote the bot to admin.",
    );
  }
  if (watchedChatIds.length === 0) {
    logger.warn(
      "No enabled chat pair. Ingest stores messages only for chats in an enabled pair. Finish with /pair source and /pair target.",
    );
  }
}
