import type { ApiCallFn, Bot } from "grammy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot, flushRelocate, stopRelocate } from "../../src/bot.js";
import { setChatLocale } from "../../src/db/chatSettings.js";
import type { DbHandle } from "../../src/db/client.js";
import { findMessage } from "../../src/db/messages.js";
import {
  listRelocationJobs,
  listThreads,
} from "../../src/db/relocation.js";
import { chatPairs } from "../../src/db/schema.js";
import { createLogger } from "../../src/logger.js";
import type { ApiCall } from "../helpers/botApiStub.js";
import { testBotInfo } from "../helpers/botInfo.js";
import { assertHappyRelocate, methodsOf } from "../helpers/expectFlowA.js";
import {
  REPLY_ONE,
  REPLY_TWO,
  ROOT,
  SOURCE_CHAT_ID,
  TARGET_CHAT_ID,
  deliverCluster,
  forwardUpdate,
  seedPair,
  sourceUpdate,
  type Original,
} from "../helpers/flowA.js";
import { createTestDb } from "../helpers/db.js";

const STALE_SOURCE_CHAT_ID = -1005555555555;

function installRecorder(
  bot: Bot,
  options?: { failDelete?: boolean },
): ApiCall[] {
  const calls: ApiCall[] = [];
  let nextId = 799;
  bot.api.config.use(async (_prev, method, payload) => {
    const body = (payload ?? {}) as Record<string, unknown>;
    calls.push({ method, payload: body });
    if (options?.failDelete && method === "deleteMessages") {
      throw new Error("not enough rights");
    }
    if (method === "sendMessage") {
      return {
        ok: true,
        result: {
          message_id: ++nextId,
          date: 1_700_000_900,
          chat: { id: body.chat_id, type: "supergroup", title: "Chat" },
          text: body.text,
        },
      } as Awaited<ReturnType<ApiCallFn>>;
    }
    if (method === "editMessageText") {
      return {
        ok: true,
        result: {
          message_id: body.message_id,
          date: 1_700_000_900,
          chat: { id: body.chat_id, type: "supergroup" },
          text: body.text,
        },
      } as Awaited<ReturnType<ApiCallFn>>;
    }
    if (method === "copyMessage") {
      return {
        ok: true,
        result: { message_id: ++nextId },
      } as Awaited<ReturnType<ApiCallFn>>;
    }
    return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
  });
  return calls;
}

describe("Flow A relocate (API transformer)", () => {
  let bot: Bot;
  let calls: ApiCall[];
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
    await seedPair(handle.db);
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({
      token: "test:token",
      logger,
      db: handle.db,
      batchWindowMs: 60_000,
    });
    bot.botInfo = testBotInfo;
    calls = installRecorder(bot);
    await bot.init();
  });

  afterEach(async () => {
    stopRelocate(bot);
    await handle.close();
  });

  it("A1_relocate_happy posts a thread, copies replies, then deletes", async () => {
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

    const jobs = await listRelocationJobs(handle.db);
    expect(jobs.map((job) => job.phase)).toEqual(["completed"]);
    const threads = await listThreads(handle.db);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      targetChatId: TARGET_CHAT_ID,
      rootMessageId: headerId,
      threadTitle: ROOT.text,
      topicLabel: ROOT.text,
      titleSource: "truncated",
      initiatorUserId: ROOT.fromUserId,
    });
  });

  it("A2_single_message cleans up without copying replies", async () => {
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
    expect((await listRelocationJobs(handle.db))[0]?.phase).toBe("completed");
  });

  it("A3_match_failure_safe does not delete", async () => {
    await bot.handleUpdate(
      forwardUpdate(1, 201, { ...ROOT, text: "never stored" }),
    );
    await flushRelocate(bot);

    expect(methodsOf(calls)).toEqual(["sendMessage"]);
    expect(calls[0]?.payload.text).toContain("nothing was deleted");
    expect(calls.some((call) => call.method === "deleteMessages")).toBe(false);
    const jobs = await listRelocationJobs(handle.db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      phase: "aborted",
      payload: { reason: "match_failed" },
    });
    expect(await listThreads(handle.db)).toHaveLength(0);
  });

  it("falls back to another enabled pair when the preferred target pair misses", async () => {
    // Newer id wins preferred lookup; leave a stale sibling enabled (legacy bad state).
    await handle.db.insert(chatPairs).values({
      sourceChatId: STALE_SOURCE_CHAT_ID,
      targetChatId: TARGET_CHAT_ID,
      sourceTitle: "Stale",
      targetTitle: "Helper",
      configuredByUserId: 1,
      enabled: true,
    });

    await deliverCluster(bot, [ROOT]);

    assertHappyRelocate(calls, {
      title: ROOT.text!,
      copyMessageIds: [],
      sourceMessageIds: [ROOT.messageId],
      triggerMessageIds: [201],
    });
    const jobs = await listRelocationJobs(handle.db);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      phase: "completed",
      payload: {
        sourceChatId: SOURCE_CHAT_ID,
        items: [{ sourceMessageId: ROOT.messageId }],
      },
    });
  });

  it("aborts before source deletes when target cleanup fails", async () => {
    stopRelocate(bot);
    calls = installRecorder(bot, { failDelete: true });
    await deliverCluster(bot, [ROOT, REPLY_ONE]);

    expect(calls.filter((call) => call.method === "deleteMessages")).toEqual([
      expect.objectContaining({
        payload: { chat_id: TARGET_CHAT_ID, message_ids: [201, 202] },
      }),
    ]);
    expect(calls.at(-1)?.payload.text).toContain("stopped at populated");
    const jobs = await listRelocationJobs(handle.db);
    expect(jobs[0]).toMatchObject({
      phase: "aborted",
      payload: { reason: "api_error", stoppedAt: "populated" },
    });
  });

  it("escapes user text in the header and stores the raw title", async () => {
    const nasty: Original = {
      ...ROOT,
      text: `Hello <b> & "x"`,
    };
    await deliverCluster(bot, [nasty]);
    const headerId = assertHappyRelocate(calls, {
      title: "Hello &lt;b&gt; &amp; &quot;x&quot;",
      copyMessageIds: [],
      sourceMessageIds: [nasty.messageId],
      triggerMessageIds: [201],
    });
    const threads = await listThreads(handle.db);
    expect(threads[0]).toMatchObject({
      rootMessageId: headerId,
      threadTitle: `Hello <b> & "x"`,
      topicLabel: `Hello <b> & "x"`,
    });
  });

  it("renders the header and the source notice in each chat's language", async () => {
    await setChatLocale(handle.db, TARGET_CHAT_ID, "ru");
    await setChatLocale(handle.db, SOURCE_CHAT_ID, "es");
    await deliverCluster(bot, [ROOT]);

    const header = calls.find((call) => call.method === "editMessageText");
    expect(String(header?.payload.text)).toContain("Тред:");
    expect(String(header?.payload.text)).toContain("Ссылка на тред");
    const notice = calls.filter((call) => call.method === "sendMessage").at(-1);
    expect(String(notice?.payload.text)).toContain("Continúa la conversación allí.");
    expect(notice?.payload.chat_id).toBe(SOURCE_CHAT_ID);
    expect(header?.payload.chat_id).toBe(TARGET_CHAT_ID);
  });

  it("uses the media fallback when the root has no text", async () => {
    const media: Original = { ...ROOT, text: null };
    await deliverCluster(bot, [media]);
    assertHappyRelocate(calls, {
      title: "Media message",
      copyMessageIds: [],
      sourceMessageIds: [media.messageId],
      triggerMessageIds: [201],
    });
  });

  it("truncates a long root into the header title", async () => {
    const long = "a".repeat(200);
    await deliverCluster(bot, [{ ...ROOT, text: long }]);
    const edit = calls.find((call) => call.method === "editMessageText");
    const text = String(edit?.payload.text);
    expect(text.startsWith("Thread: ")).toBe(true);
    const title = text.slice("Thread: ".length).split("\n")[0] ?? "";
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith("…")).toBe(true);
    const threads = await listThreads(handle.db);
    expect(threads[0]?.threadTitle).toBe(title);
    expect(threads[0]?.titleSource).toBe("truncated");
  });

  it("keeps two moderators in separate jobs", async () => {
    await bot.handleUpdate(sourceUpdate(1, ROOT));
    await bot.handleUpdate(sourceUpdate(2, REPLY_ONE));
    await bot.handleUpdate(forwardUpdate(3, 201, ROOT, 7));
    await bot.handleUpdate(forwardUpdate(4, 301, REPLY_ONE, 8));
    await flushRelocate(bot);

    const jobs = await listRelocationJobs(handle.db);
    expect(jobs.map((job) => job.phase)).toEqual(["completed", "completed"]);
    expect(calls.filter((call) => call.method === "copyMessage")).toHaveLength(0);
    expect(await listThreads(handle.db)).toHaveLength(2);
  });

  it("ignores forwards that are not in the target chat", async () => {
    await bot.handleUpdate(sourceUpdate(1, ROOT));
    await bot.handleUpdate({
      update_id: 2,
      message: {
        ...forwardUpdate(2, 201, ROOT).message,
        chat: {
          id: SOURCE_CHAT_ID,
          type: "supergroup" as const,
          title: "Main",
        },
      },
    });
    await flushRelocate(bot);
    expect(calls).toHaveLength(0);
    expect(await listRelocationJobs(handle.db)).toHaveLength(0);
    expect(await findMessage(handle.db, SOURCE_CHAT_ID, ROOT.messageId)).toBeTruthy();
  });
});
