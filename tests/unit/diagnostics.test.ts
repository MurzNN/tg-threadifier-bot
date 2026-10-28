import { Writable } from "node:stream";

import type { Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import pino from "pino";
import { describe, expect, it } from "vitest";

import { createIngestMiddleware } from "../../src/bot/ingest.js";
import {
  databaseLogTarget,
  logPollingReady,
  summarizeUpdate,
} from "../../src/bot/diagnostics.js";
import { upsertChatPair } from "../../src/db/chatPairs.js";
import type { Logger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

function captureLogger(level: "debug" | "info" = "debug") {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(JSON.parse(String(chunk)) as Record<string, unknown>);
      callback();
    },
  });
  const logger = pino({ level }, stream);
  return { logger: logger as unknown as Logger, lines };
}

const me = {
  id: 42,
  is_bot: true,
  first_name: "Threadifier",
  username: "threadifier_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
} satisfies UserFromGetMe;

describe("ingest diagnostics", () => {
  it("logs a stored message and a chat that is outside the pair", async () => {
    const handle = await createTestDb();
    await upsertChatPair(handle.db, {
      sourceChatId: -1001,
      targetChatId: -1002,
      enabled: true,
    });
    const { logger, lines } = captureLogger();
    const ingest = createIngestMiddleware(handle.db, logger);
    const stored = {
      update: { update_id: 1 },
      chat: { id: -1001 },
      message: { message_id: 55, date: 1_700_000_100, text: "hello" },
    } as Context;
    const ignored = {
      update: { update_id: 2 },
      chat: { id: -9999 },
      message: { message_id: 56, date: 1_700_000_100, text: "noise" },
    } as Context;

    await ingest(stored, async () => {});
    await ingest(ignored, async () => {});
    await handle.close();

    expect(lines.map((line) => line.msg)).toEqual([
      "ingest stored message",
      "ingest skipped: chat is not in an enabled pair",
    ]);
    expect(lines[1]).toMatchObject({
      chatId: -9999,
      messageId: 56,
      watchedChatIds: [-1001, -1002],
    });
  });

  it("summarizes an update without copying message text", () => {
    const summary = summarizeUpdate({
      update: {
        update_id: 7,
        message: {
          message_id: 3,
          date: 1,
          chat: { id: -1001, type: "supergroup" },
          text: "/pair source secret",
        },
      },
      chat: { id: -1001, type: "supergroup" },
      message: {
        message_id: 3,
        text: "/pair source secret",
        from: { id: 9 },
      },
    } as unknown as Context);

    expect(summary).toMatchObject({
      updateId: 7,
      chatId: -1001,
      messageId: 3,
      fromUserId: 9,
      isCommand: true,
    });
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("warns when privacy mode hides ordinary group messages", () => {
    const { logger, lines } = captureLogger("info");
    logPollingReady(logger, me, [], undefined);
    expect(lines.map((line) => line.msg)).toEqual([
      "bot started (long polling)",
      "Privacy mode is on (can_read_all_group_messages is false). In a group where this bot is not an admin, Telegram delivers commands, mentions, and replies to the bot. Ordinary messages never arrive, so ingest cannot store them. Disable privacy in BotFather with /setprivacy, or promote the bot to admin.",
      "No enabled chat pair. Ingest stores messages only for chats in an enabled pair. Finish with /pair source and /pair target.",
    ]);
    expect(lines[0]).toMatchObject({
      canReadAllGroupMessages: false,
      watchedChatIds: [],
      database: "file:./data/threadifier-pg",
    });
  });

  it("strips credentials from a Postgres URL", () => {
    expect(
      databaseLogTarget("postgresql://threadifier:secret@db.internal:5432/threadifier"),
    ).toBe("postgresql://db.internal:5432/threadifier");
  });
});
