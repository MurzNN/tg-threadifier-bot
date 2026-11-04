import type { Bot } from "grammy";
import { afterEach, describe, expect, it } from "vitest";

import { clearCanDeleteMessagesCache } from "../../src/bot/admin.js";
import { createBot, flushRelocate, stopRelocate } from "../../src/bot.js";
import type { DbHandle } from "../../src/db/client.js";
import { listRelocationJobs, listThreads } from "../../src/db/relocation.js";
import { createLogger } from "../../src/logger.js";
import { startBotApiStub, type ApiCall } from "../helpers/botApiStub.js";
import { testBotInfo } from "../helpers/botInfo.js";
import { assertHappyRelocate, methodsOf } from "../helpers/expectFlowA.js";
import {
  FORUM_CHAT_ID,
  REPLY_ONE,
  REPLY_TWO,
  ROOT,
  SOURCE_TOPIC_ID,
  TARGET_CHAT_ID,
  TARGET_TOPIC_ID,
  deliverCluster,
  forwardUpdate,
  seedForumPair,
  seedPair,
} from "../helpers/flowA.js";
import { pressRelocate } from "../helpers/confirmRelocate.js";
import { createTestDb } from "../helpers/db.js";

/**
 * Emulator-depth Flow A: grammY's HTTP client talks to a local Bot API stub.
 * Same stories as the transformer tests, including the real request path.
 */
describe("Flow A relocate (Bot API HTTP stub)", () => {
  let bot: Bot;
  let handle: DbHandle;
  let calls: ApiCall[];
  let closeStub: () => Promise<void>;

  afterEach(async () => {
    stopRelocate(bot);
    await closeStub?.();
    await handle?.close();
  });

  async function setup(): Promise<void> {
    clearCanDeleteMessagesCache();
    handle = await createTestDb();
    await seedPair(handle.db);
    const stub = await startBotApiStub();
    calls = stub.calls;
    closeStub = stub.close;
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({
      token: "test:token",
      logger,
      db: handle.db,
      apiRoot: stub.apiRoot,
      batchWindowMs: 60_000,
    });
    bot.botInfo = testBotInfo;
    await bot.init();
  }

  it("A1_relocate_happy", { timeout: 20_000 }, async () => {
    await setup();
    await deliverCluster(bot, [ROOT, REPLY_ONE, REPLY_TWO]);
    await pressRelocate(bot, calls, "new");
    expect(methodsOf(calls)).toEqual([
      "getChatMember",
      "sendMessage",
      "getChatMember",
      "answerCallbackQuery",
      "getChatMember",
      "deleteMessage",
      "sendMessage",
      "editMessageText",
      "copyMessage",
      "editMessageText",
      "copyMessage",
      "editMessageText",
      "deleteMessages",
      "deleteMessages",
      "sendMessage",
    ]);
    const headerId = assertHappyRelocate(calls, {
      title: ROOT.text!,
      copyMessageIds: [REPLY_ONE.messageId, REPLY_TWO.messageId],
      replies: [
        { body: REPLY_ONE.text!, author: "Grace", userId: REPLY_ONE.fromUserId },
        { body: REPLY_TWO.text!, author: "Ada Lovelace", userId: REPLY_TWO.fromUserId },
      ],
      sourceMessageIds: [ROOT.messageId, REPLY_ONE.messageId, REPLY_TWO.messageId],
      triggerMessageIds: [201, 202, 203],
    });
    expect((await listRelocationJobs(handle.db))[0]?.phase).toBe("completed");
    expect((await listThreads(handle.db))[0]?.rootMessageId).toBe(headerId);
    expect((await listThreads(handle.db))[0]?.targetChatId).toBe(TARGET_CHAT_ID);
  });

  it("A2_single_message", { timeout: 20_000 }, async () => {
    await setup();
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "new");
    expect(methodsOf(calls)).toEqual([
      "getChatMember",
      "sendMessage",
      "getChatMember",
      "answerCallbackQuery",
      "getChatMember",
      "deleteMessage",
      "sendMessage",
      "editMessageText",
      "deleteMessages",
      "deleteMessages",
      "sendMessage",
    ]);
    assertHappyRelocate(calls, {
      title: ROOT.text!,
      copyMessageIds: [],
      sourceMessageIds: [ROOT.messageId],
      triggerMessageIds: [201],
    });
  });

  it("A3_match_failure_safe", { timeout: 20_000 }, async () => {
    await setup();
    await bot.handleUpdate(
      forwardUpdate(1, 201, { ...ROOT, text: "never stored" }),
    );
    await flushRelocate(bot);
    expect(methodsOf(calls)).toEqual(["getChatMember", "sendMessage"]);
    expect(calls.some((call) => call.method === "deleteMessages")).toBe(false);
    expect((await listRelocationJobs(handle.db))[0]).toMatchObject({
      phase: "aborted",
      payload: { reason: "match_failed" },
    });
  });

  it("A5_forum_topic_relocate", { timeout: 20_000 }, async () => {
    await setup();
    await seedForumPair(handle.db);
    await deliverCluster(bot, [ROOT, REPLY_ONE], {
      sourceChatId: FORUM_CHAT_ID,
      targetChatId: FORUM_CHAT_ID,
      sourceTopicId: SOURCE_TOPIC_ID,
      targetTopicId: TARGET_TOPIC_ID,
    });
    await pressRelocate(bot, calls, "new", { chatId: FORUM_CHAT_ID });
    expect(
      calls.some(
        (call) =>
          call.method === "copyMessage" &&
          call.payload.message_thread_id === TARGET_TOPIC_ID,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === "sendMessage" &&
          call.payload.message_thread_id === SOURCE_TOPIC_ID,
      ),
    ).toBe(true);
    expect(
      calls.some(
        (call) =>
          call.method === "sendMessage" &&
          call.payload.message_thread_id === TARGET_TOPIC_ID,
      ),
    ).toBe(true);
  });
});
