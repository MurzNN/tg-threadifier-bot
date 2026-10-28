import type { Bot } from "grammy";
import { afterEach, describe, expect, it } from "vitest";

import { createBot, flushRelocate, stopRelocate } from "../../src/bot.js";
import type { DbHandle } from "../../src/db/client.js";
import { listRelocationJobs, listThreads } from "../../src/db/relocation.js";
import { createLogger } from "../../src/logger.js";
import { startBotApiStub, type ApiCall } from "../helpers/botApiStub.js";
import { testBotInfo } from "../helpers/botInfo.js";
import { assertHappyRelocate, methodsOf } from "../helpers/expectFlowA.js";
import {
  REPLY_ONE,
  REPLY_TWO,
  ROOT,
  TARGET_CHAT_ID,
  deliverCluster,
  forwardUpdate,
  seedPair,
} from "../helpers/flowA.js";
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
    expect(methodsOf(calls)).toEqual([
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
    expect(methodsOf(calls)).toEqual([
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
    expect(methodsOf(calls)).toEqual(["sendMessage"]);
    expect(calls.some((call) => call.method === "deleteMessages")).toBe(false);
    expect((await listRelocationJobs(handle.db))[0]).toMatchObject({
      phase: "aborted",
      payload: { reason: "match_failed" },
    });
  });
});
