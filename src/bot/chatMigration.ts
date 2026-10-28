import type { Context, MiddlewareFn } from "grammy";

import type { PairDraftStore } from "../db/chatPairs.js";
import { remapChatId } from "../db/chatMigration.js";
import type { AppDb } from "../db/client.js";
import type { Logger } from "../logger.js";

/**
 * Read a group → supergroup upgrade from either service message.
 * `migrate_to_chat_id` arrives in the old group; `migrate_from_chat_id` in the new one.
 */
export function readChatMigration(
  msg: { migrate_to_chat_id?: number; migrate_from_chat_id?: number } | undefined,
  chatId: number | undefined,
): { oldChatId: number; newChatId: number } | null {
  if (!msg || chatId == null) return null;
  if (typeof msg.migrate_to_chat_id === "number") {
    return { oldChatId: chatId, newChatId: msg.migrate_to_chat_id };
  }
  if (typeof msg.migrate_from_chat_id === "number") {
    return { oldChatId: msg.migrate_from_chat_id, newChatId: chatId };
  }
  return null;
}

/** Remap stored chat ids when Telegram upgrades a paired group to a supergroup. */
export function createChatMigrationMiddleware(
  db: AppDb,
  logger: Logger,
  pairDrafts?: PairDraftStore,
): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const migration = readChatMigration(ctx.message, ctx.chat?.id);
    if (!migration) {
      await next();
      return;
    }

    try {
      const result = await remapChatId(
        db,
        migration.oldChatId,
        migration.newChatId,
      );
      const drafts =
        pairDrafts?.remapChatId(migration.oldChatId, migration.newChatId) ?? 0;
      logger.info(
        {
          oldChatId: migration.oldChatId,
          newChatId: migration.newChatId,
          ...result,
          pairDrafts: drafts,
        },
        "chat migrated group → supergroup",
      );
    } catch (err) {
      logger.error(
        {
          err,
          oldChatId: migration.oldChatId,
          newChatId: migration.newChatId,
        },
        "chat migration remap failed",
      );
    }

    await next();
  };
}
