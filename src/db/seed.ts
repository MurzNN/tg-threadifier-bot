import type { Env } from "../env.js";
import type { Logger } from "../logger.js";
import type { AppDb } from "./client.js";
import { upsertChatPair } from "./chatPairs.js";

/** Idempotent env seed for local / Test DC until Mini App owns pairing. */
export async function seedChatPairFromEnv(
  db: AppDb,
  env: Env,
  logger: Logger,
): Promise<void> {
  if (env.SOURCE_CHAT_ID == null || env.TARGET_CHAT_ID == null) return;
  if (env.SOURCE_CHAT_ID === env.TARGET_CHAT_ID) {
    logger.warn("SOURCE_CHAT_ID and TARGET_CHAT_ID are equal; skipping seed");
    return;
  }
  const pair = await upsertChatPair(db, {
    sourceChatId: env.SOURCE_CHAT_ID,
    targetChatId: env.TARGET_CHAT_ID,
    enabled: true,
  });
  logger.info(
    {
      pairId: pair.id,
      sourceChatId: pair.sourceChatId,
      targetChatId: pair.targetChatId,
    },
    "seeded chat pair from env",
  );
}
