import type { ApiCallFn, Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot } from "../../src/bot.js";
import { upsertChatPair } from "../../src/db/chatPairs.js";
import type { DbHandle } from "../../src/db/client.js";
import { countMessages } from "../../src/db/messages.js";
import { createLogger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

const botInfo = {
  id: 42,
  is_bot: true,
  first_name: "Threadifier",
  username: "threadifier_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: true,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
} satisfies UserFromGetMe;

describe("ingest middleware", () => {
  let bot: Bot;
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    await upsertChatPair(handle.db, {
      sourceChatId: -1001,
      targetChatId: -1002,
      enabled: true,
    });
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({ token: "test:token", logger, db: handle.db });
    bot.botInfo = botInfo;
    bot.api.config.use(async (_prev, _method) => {
      return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
    });
    await bot.init();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("stores messages from configured chats", async () => {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 55,
        date: 1_700_000_100,
        chat: { id: -1001, type: "supergroup", title: "Main" },
        from: { id: 9, is_bot: false, first_name: "User" },
        text: "offtopic hello",
      },
    });

    expect(await countMessages(handle.db)).toBe(1);
  });

  it("ignores messages outside configured pairs", async () => {
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 56,
        date: 1_700_000_100,
        chat: { id: -9999, type: "supergroup", title: "Other" },
        from: { id: 9, is_bot: false, first_name: "User" },
        text: "noise",
      },
    });

    expect(await countMessages(handle.db)).toBe(0);
  });
});
