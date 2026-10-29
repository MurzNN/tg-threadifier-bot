import { afterEach, describe, expect, it } from "vitest";

import { upsertChatPair, listEnabledPairs } from "../../src/db/chatPairs.js";
import type { DbHandle } from "../../src/db/client.js";
import { countMessages, upsertMessage } from "../../src/db/messages.js";
import { contentFingerprint } from "../../src/lib/fingerprint.js";
import { seedChatPairFromEnv } from "../../src/db/seed.js";
import { createLogger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

/**
 * M1 persistence smoke, plus the env-seed path.
 * Flow A HTTP scenarios live in `flow-a.test.ts`.
 */
describe("PGlite persistence smoke", () => {
  let handle: DbHandle;

  afterEach(async () => {
    await handle?.close();
  });

  // PGlite + migrate can exceed the default 5s under parallel Vitest load.
  it("seeds a pair from env and upserts a message", { timeout: 15_000 }, async () => {
    handle = await createTestDb();
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });

    await seedChatPairFromEnv(
      handle.db,
      {
        BOT_TOKEN: "test:token",
        PORT: 3000,
        LOG_LEVEL: "silent",
        TELEGRAM_ENVIRONMENT: "prod",
        NODE_ENV: "test",
        SOURCE_CHAT_ID: -42,
        TARGET_CHAT_ID: -43,
        CONFIGURED_BY_USER_ID: 7,
      },
      logger,
    );

    const pairs = await listEnabledPairs(handle.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      sourceChatId: -42,
      targetChatId: -43,
      configuredByUserId: 7,
      enabled: true,
    });

    await upsertMessage(handle.db, {
      chatId: -42,
      messageId: 1,
      fromUserId: 5,
      date: 1_700_000_000,
      text: "hello",
      caption: null,
      contentFingerprint: contentFingerprint({ text: "hello" }),
      replyToMessageId: null,
      forwardOrigin: null,
      raw: { text: "hello" },
    });

    expect(await countMessages(handle.db)).toBe(1);

    // Idempotent upsert
    await upsertMessage(handle.db, {
      chatId: -42,
      messageId: 1,
      fromUserId: 5,
      date: 1_700_000_000,
      text: "hello edited",
      caption: null,
      contentFingerprint: contentFingerprint({ text: "hello edited" }),
      replyToMessageId: null,
      forwardOrigin: null,
      raw: { text: "hello edited" },
    });
    expect(await countMessages(handle.db)).toBe(1);
  });

  it("upsertChatPair is idempotent for the same ids", async () => {
    handle = await createTestDb();
    const a = await upsertChatPair(handle.db, {
      sourceChatId: 1,
      targetChatId: 2,
      configuredByUserId: 7,
      sourceTitle: "A",
    });
    const b = await upsertChatPair(handle.db, {
      sourceChatId: 1,
      targetChatId: 2,
      configuredByUserId: 7,
      sourceTitle: "A2",
    });
    expect(b.id).toBe(a.id);
    expect(b.sourceTitle).toBe("A2");
    expect(await listEnabledPairs(handle.db)).toHaveLength(1);
  });
});
