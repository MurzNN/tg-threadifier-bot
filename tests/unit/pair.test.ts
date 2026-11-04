import { t } from "@lingui/core/macro";
import type { ApiCallFn, Bot } from "grammy";
import type { ChatMember, UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot } from "../../src/bot.js";
import {
  listChatPairs,
  listChatPairsForUser,
  listEnabledPairs,
  listPairsForChat,
} from "../../src/db/chatPairs.js";
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

function chatLabel(title: string | null, chatId: number): string {
  const name = title?.replace(/\s+/g, " ").trim();
  return name ? `${name} (${chatId})` : String(chatId);
}

function installApiRecorder(bot: Bot, member: () => ChatMember): OutgoingCall[] {
  const calls: OutgoingCall[] = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    if (method === "getChatMember") {
      return { ok: true, result: member() } as Awaited<
        ReturnType<ApiCallFn>
      >;
    }
    return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
  });
  return calls;
}

function privateCommand(updateId: number, text: string, userId = 7) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: { id: userId, type: "private" as const, first_name: "Admin" },
      from: { id: userId, is_bot: false, first_name: "Admin" },
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
  userId = 7,
  isForum = false,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 1_700_000_000,
      chat: {
        id: chatId,
        type: "supergroup" as const,
        title,
        ...(isForum ? { is_forum: true as const } : {}),
      },
      from: { id: userId, is_bot: false, first_name: "Admin" },
      text,
      entities: [{ offset: 0, length: text.indexOf(" ") === -1 ? text.length : text.indexOf(" "), type: "bot_command" as const }],
    },
  };
}

describe("pair commands", () => {
  let bot: Bot;
  let calls: OutgoingCall[];
  let handle: DbHandle;
  let member: ChatMember;

  beforeEach(async () => {
    handle = await createTestDb();
    member = adminMember;
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({ token: "test:token", logger, db: handle.db });
    bot.botInfo = botInfo;
    calls = installApiRecorder(bot, () => member);
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
      configuredByUserId: 7,
      enabled: true,
    });

    const replies = calls.filter((c) => c.method === "sendMessage");
    const pair = pairs[0]!;
    expect(replies.at(-1)?.payload.text).toBe(
      t`Pair enabled: source ${pair.sourceChatId} → target ${pair.targetChatId}. Ingest is active for both chats.`,
    );
  });

  it("enabling a pair disables other enabled pairs for the same target", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1003, "/pair source", "Other"));
    await bot.handleUpdate(groupCommand(4, -1002, "/pair target", "Helper"));

    const enabled = await listEnabledPairs(handle.db);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]).toMatchObject({
      sourceChatId: -1003,
      targetChatId: -1002,
      enabled: true,
    });

    const all = await listChatPairs(handle.db);
    expect(all).toHaveLength(2);
    expect(all.find((pair) => pair.sourceChatId === -1001)?.enabled).toBe(false);
  });

  it("/status reports the pair for the current chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(3, -1001, "/status", "Main"));
    const here = (await listEnabledPairs(handle.db))[0]!;
    const role = "source";
    const reply = calls.find((c) => c.method === "sendMessage");
    expect(reply?.payload.text).toBe(
      t`This chat is the ${role} in pair #${here.id}: ${here.sourceChatId} → ${here.targetChatId}.`,
    );
  });

  it("/status in a private chat with no pairs points at the slash commands", async () => {
    await bot.handleUpdate(privateCommand(1, "/status"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload.text).toBe(
      t`No enabled chat pairs. Use /pair source and /pair target, or /pair forum.`,
    );
  });

  it("/pair with no arguments lists the caller's configured pairs in a private chat", async () => {
    const noPairs = t`No chat pairs configured. Run /pair source and /pair target inside the group chats to link, or /pair forum in a forum group.`;
    await bot.handleUpdate(privateCommand(1, "/pair"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload).toMatchObject({
      chat_id: 7,
      text: noPairs,
    });

    await bot.handleUpdate(groupCommand(2, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(3, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(4, -1003, "/pair source", "Other"));
    await bot.handleUpdate(groupCommand(5, -1004, "/pair target", "Side"));
    calls.length = 0;

    await bot.handleUpdate(privateCommand(6, "/pair"));
    const pairs = await listChatPairsForUser(handle.db, 7);
    const lines = pairs.map((pair) => {
      const source = chatLabel(pair.sourceTitle, pair.sourceChatId);
      const target = chatLabel(pair.targetTitle, pair.targetChatId);
      return t`#${pair.id} (enabled): ${source} → ${target}`;
    });
    expect(calls.find((c) => c.method === "sendMessage")?.payload.text).toBe(
      t`Configured pairs:\n${lines.join("\n")}`,
    );

    calls.length = 0;
    await bot.handleUpdate(privateCommand(7, "/pair", 8));
    expect(calls.find((c) => c.method === "sendMessage")?.payload).toMatchObject({
      chat_id: 8,
      text: noPairs,
    });
  });

  it("/pair with no arguments reports this chat's pairing in a group", async () => {
    const notPaired = t`This chat is not paired. Admins can run /pair source, /pair target, or /pair forum here.`;
    await bot.handleUpdate(groupCommand(1, -1001, "/pair", "Main"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload).toMatchObject({
      chat_id: -1001,
      text: notPaired,
    });

    await bot.handleUpdate(groupCommand(2, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(3, -1002, "/pair target", "Helper"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(4, -1002, "/pair", "Helper"));
    const pair = (await listPairsForChat(handle.db, -1002))[0]!;
    const source = chatLabel(pair.sourceTitle, pair.sourceChatId);
    const target = chatLabel(pair.targetTitle, pair.targetChatId);
    expect(calls.find((c) => c.method === "sendMessage")?.payload.text).toBe(
      t`This chat is the target in pair #${pair.id} (enabled).\nSource: ${source}\nTarget: ${target}`,
    );
    expect(calls.some((c) => c.method === "getChatMember")).toBe(false);
  });

  it("/pair in a group lists every pair that includes the chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(4, -1004, "/pair target", "Side"));
    calls.length = 0;

    await bot.handleUpdate(groupCommand(5, -1001, "/pair", "Main"));
    const pairs = await listPairsForChat(handle.db, -1001);
    const blocks = pairs.map((pair) => {
      const source = chatLabel(pair.sourceTitle, pair.sourceChatId);
      const target = chatLabel(pair.targetTitle, pair.targetChatId);
      return t`This chat is the source in pair #${pair.id} (enabled).\nSource: ${source}\nTarget: ${target}`;
    });
    expect(calls.find((c) => c.method === "sendMessage")?.payload.text).toBe(
      t`This chat is in ${pairs.length} pairs:\n${blocks.join("\n\n")}`,
    );
  });

  it("/unpair deletes the caller's pairs for the chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/unpair", "Main"));

    expect(await listChatPairs(handle.db)).toHaveLength(0);
    const deleted = 1;
    expect(calls.at(-1)?.payload.text).toBe(
      t`Deleted ${deleted} chat pair(s) involving this chat.`,
    );

    calls.length = 0;
    await bot.handleUpdate(groupCommand(4, -1001, "/pair", "Main"));
    expect(calls.find((c) => c.method === "sendMessage")?.payload.text).toBe(
      t`This chat is not paired. Admins can run /pair source, /pair target, or /pair forum here.`,
    );
  });

  it("refuses the same source and target when another user already owns the pair", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1002, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/pair source", "Main", 8));
    await bot.handleUpdate(groupCommand(4, -1002, "/pair target", "Helper", 8));

    expect(calls.at(-1)?.payload.text).toBe(
      t`This source and target are already paired by another user.`,
    );
    const pairs = await listChatPairs(handle.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      sourceChatId: -1001,
      targetChatId: -1002,
      configuredByUserId: 7,
      enabled: true,
    });

    calls.length = 0;
    await bot.handleUpdate(groupCommand(5, -1001, "/unpair", "Main", 8));
    expect(calls.at(-1)?.payload.text).toBe(
      t`This pair was configured by another user.`,
    );
    expect(await listEnabledPairs(handle.db)).toHaveLength(1);
  });

  it("/pair forum enables a same-chat pair in a forum group", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair forum", "Forum", 7, true));
    const pairs = await listEnabledPairs(handle.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({
      sourceChatId: -1001,
      targetChatId: -1001,
      configuredByUserId: 7,
      enabled: true,
    });
    const pair = pairs[0]!;
    expect(calls.at(-1)?.payload.text).toBe(
      t`Forum mode enabled for this group (pair #${pair.id}). Forwards between topics are relocated here.`,
    );
  });

  it("/pair forum is rejected when the group has no topics", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair forum", "Plain"));
    expect(calls.at(-1)?.payload.text).toBe(
      t`Forum mode only works in a group with topics enabled.`,
    );
    expect(await listChatPairs(handle.db)).toHaveLength(0);
  });

  it("/pair forum is rejected for non-admins", async () => {
    member = { status: "member", user: { id: 7, is_bot: false, first_name: "Mod" } } as ChatMember;
    await bot.handleUpdate(groupCommand(1, -1001, "/pair forum", "Forum", 7, true));
    expect(calls.at(-1)?.payload.text).toBe(t`Only chat admins can configure pairs.`);
    expect(await listChatPairs(handle.db)).toHaveLength(0);
  });

  it("/pair forum conflicts when another user already enabled forum mode", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair forum", "Forum", 7, true));
    await bot.handleUpdate(groupCommand(2, -1001, "/pair forum", "Forum", 8, true));
    expect(calls.at(-1)?.payload.text).toBe(
      t`This source and target are already paired by another user.`,
    );
    const pairs = await listChatPairs(handle.db);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.configuredByUserId).toBe(7);
  });

  it("/pair forum soft-disables a cross-group pair that targets this chat", async () => {
    await bot.handleUpdate(groupCommand(1, -1002, "/pair source", "Main"));
    await bot.handleUpdate(groupCommand(2, -1001, "/pair target", "Helper"));
    await bot.handleUpdate(groupCommand(3, -1001, "/pair forum", "Helper", 7, true));

    const enabled = await listEnabledPairs(handle.db);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]).toMatchObject({
      sourceChatId: -1001,
      targetChatId: -1001,
      enabled: true,
    });
    const all = await listChatPairs(handle.db);
    expect(all.find((pair) => pair.sourceChatId === -1002)?.enabled).toBe(false);
  });

  it("/status, /pair, and /unpair describe a forum pair", async () => {
    await bot.handleUpdate(groupCommand(1, -1001, "/pair forum", "Forum", 7, true));
    calls.length = 0;
    await bot.handleUpdate(groupCommand(2, -1001, "/status", "Forum", 7, true));
    const pair = (await listEnabledPairs(handle.db))[0]!;
    expect(calls.at(-1)?.payload.text).toBe(
      t`This chat is in forum mode in pair #${pair.id}: ${pair.sourceChatId}.`,
    );

    calls.length = 0;
    await bot.handleUpdate(groupCommand(3, -1001, "/pair", "Forum", 7, true));
    expect(calls.at(-1)?.payload.text).toBe(
      t`This chat is in forum mode in pair #${pair.id} (enabled).`,
    );

    calls.length = 0;
    await bot.handleUpdate(privateCommand(4, "/pair"));
    const label = chatLabel(pair.sourceTitle, pair.sourceChatId);
    const lines = [t`#${pair.id} (enabled, forum): ${label}`];
    expect(calls.at(-1)?.payload.text).toBe(t`Configured pairs:\n${lines.join("\n")}`);

    calls.length = 0;
    await bot.handleUpdate(groupCommand(5, -1001, "/unpair", "Forum", 7, true));
    expect(await listChatPairs(handle.db)).toHaveLength(0);
    const deleted = 1;
    expect(calls.at(-1)?.payload.text).toBe(
      t`Deleted ${deleted} chat pair(s) involving this chat.`,
    );
  });
});
