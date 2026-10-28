import type { ApiCallFn, Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { beforeEach, describe, expect, it } from "vitest";

import { createBot } from "../../src/bot.js";
import { createLogger } from "../../src/logger.js";

type OutgoingCall = {
  method: string;
  payload: Record<string, unknown>;
};

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

function installApiRecorder(bot: Bot): OutgoingCall[] {
  const calls: OutgoingCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
  });
  return calls;
}

describe("/start (GrammY API transformer)", () => {
  let bot: Bot;
  let calls: OutgoingCall[];

  beforeEach(async () => {
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({ token: "test:token", logger });
    bot.botInfo = botInfo;
    calls = installApiRecorder(bot);
    await bot.init();
  });

  it("replies with the English Lingui default", async () => {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        date: 1_700_000_000,
        chat: { id: 100, type: "private", first_name: "Mod" },
        from: { id: 100, is_bot: false, first_name: "Mod" },
        text: "/start",
        entities: [{ offset: 0, length: 6, type: "bot_command" }],
      },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("sendMessage");
    expect(calls[0]?.payload).toMatchObject({
      chat_id: 100,
      text: "Threadifier is online. Operators will link source and target chats in the Mini App.",
    });
  });
});
