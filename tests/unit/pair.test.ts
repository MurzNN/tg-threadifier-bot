import type { ApiCallFn, Bot } from "grammy";
import type { ChatMember, UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot } from "../../src/bot.js";
import { listEnabledPairs } from "../../src/db/chatPairs.js";
import type { DbHandle } from "../../src/db/client.js";
import { createLogger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

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

const adminMember = {
  status: "administrator",
  user: { id: 7, is_bot: false, first_name: "Admin" },
  can_be_edited: false,
  is_anonymous: false,
  can_manage_chat: true,
  can_delete_messages: true,
  can_manage_video_chats: true,
  can_restrict_members: true,
  can_promote_members: true,
  can_change_info: true,
  can_invite_users: true,
  can_post_stories: true,
  can_edit_stories: true,
  can_delete_stories: true,
  can_manage_direct_messages: true,
  can_post_messages: true,
  can_edit_messages: true,
  can_pin_messages: true,
  can_manage_topics: true,
} as ChatMember;

function installApiRecorder(bot: Bot): OutgoingCall[] {
  const calls: OutgoingCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "getChatMember") {
      return { ok: true, result: adminMember } as Awaited<
        ReturnType<ApiCallFn>
      >;
    }
    return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
  });
  return calls;
}

function privateCommand(updateId: number, text: string) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: 7, type: "private" as const, first_name: "Admin" },
      from: { id: 7, is_bot: false, first_name: "Admin" },
      text,
      entities: [
        {
          offset: 0,
          length: text.indexOf(" ") === -1 ? text.length : text.indexOf(" "),
          type: "bot_command" as const,
        },
      ],
    },
  };
}

function groupCommand(
  updateId: number,
  chatId: number,
  text: string,
  title: string,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: chatId, type: "supergroup" as const, title },
      from: { id: 7, is_bot: false, first_name: "Admin" },
      text,
      entities: [{ offset: 0, length: text.indexOf(" ") === -1 ? text.length : text.indexOf(" "), type: "bot_command" as const }],
    },
  };
}

describe("pair commands", () => {
  let bot: Bot;
  let calls: OutgoingCall[];
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({ token: "test:token", logger, db: handle.db });
    bot.botInfo = botInfo;
    calls = installApiRecorder(bot);
    await bot.init();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("links source then target into an enabled pair", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));

    const pairs = await listEnabledPairs(handle.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      sourceChatId: -1001,
      targetChatId: -1002,
      enabled: true,
    });

    const replies = calls.filter((c) => c.method === "sendMessage");
    expect(replies.at(-1)?.payload).toMatchObject({
      text: expect.stringContaining("Pair enabled"),
    });
  });

  it("/status reports the pair for the current chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(3, -1001, "/status", "Main"));
    const reply = calls.find((c) => c.method === "sendMessage");
    expect(reply?.payload).toMatchObject({
      text: expect.stringContaining("source"),
    });
  });

  it("/pair with no arguments lists every configured pair in a private chat", async () => {
    await bot.handleUpdate(privateCommand(1, "/pair"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload).toMatchObject({
      chat_id: 7,
      text: expect.stringContaining("No chat pairs configured"),
    });

    await bot.handleUpdate(groupCommand(2, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(3, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(4, -1003, "/pair source", "Other"));
    await bot.handleUpdate(groupCommand(5, -1004, "/pair target", "Side"));
    calls.length = 0;

    await bot.handleUpdate(privateCommand(6, "/pair"));
    const text = String(
      calls.find((c) => c.method === "sendMessage")?.payload.text,
    );
    expect(text).toContain("Configured pairs:");
    expect(text).toContain("(enabled): Main (-1001) → Helper (-1002)");
    expect(text).toContain("(enabled): Other (-1003) → Side (-1004)");
  });

  it("/pair with no arguments reports this chat's pairing in a group", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair", "Main"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload).toMatchObject({
      chat_id: -1001,
      text: expect.stringContaining("not paired"),
    });

    await bot.handleUpdate(groupCommand(2, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(3, -1002, "/pair target", "Helper"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(4, -1002, "/pair", "Helper"));
    const text = String(
      calls.find((c) => c.method === "sendMessage")?.payload.text,
    );
    expect(text).toContain("This chat is the target in pair #");
    expect(text).toContain("(enabled)");
    expect(text).toContain("Source: Main (-1001)");
    expect(text).toContain("Target: Helper (-1002)");
    expect(calls.some((c) => c.method === "getChatMember")).toBe(false);
  });

  it("/pair in a group lists every pair that includes the chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(4, -1004, "/pair target", "Side"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(5, -1001, "/pair", "Main"));
    const text = String(
      calls.find((c) => c.method === "sendMessage")?.payload.text,
    );
    expect(text).toContain("This chat is in 2 pairs:");
    expect(text).toContain("Helper (-1002)");
    expect(text).toContain("Side (-1004)");
    expect(text).not.toContain("not paired");
  });

  it("/pair in a group reports a disabled pair", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/unpair", "Main"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(4, -1001, "/pair", "Main"));
    const text = String(
      calls.find((c) => c.method === "sendMessage")?.payload.text,
    );
    expect(text).toContain("This chat is the source in pair #");
    expect(text).toContain("(disabled)");
    expect(text).toContain("Source: Main (-1001)");
    expect(text).toContain("Target: Helper (-1002)");
  });

  it("/unpair disables pairs for the chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/unpair", "Main"));

    expect(await listEnabledPairs(handle.db)).toHaveLength(0);
  });
});
