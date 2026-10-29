import type { ApiCallFn, Bot } from "grammy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot, flushRelocate, stopRelocate } from "../../src/bot.js";
import { RelocationDraftStore } from "../../src/bot/relocate/drafts.js";
import {
  renderConfirmPrompt,
  renderMatchFailure,
  renderPreviewLine,
  renderRelocateAborted,
  resolveRootTitles,
} from "../../src/bot/relocate/templates.js";
import { setChatLocale } from "../../src/db/chatSettings.js";
import type { DbHandle } from "../../src/db/client.js";
import { findMessage } from "../../src/db/messages.js";
import {
  listRelocationJobs,
  listThreads,
} from "../../src/db/relocation.js";
import { chatPairs } from "../../src/db/schema.js";
import { createLogger } from "../../src/logger.js";
import { THREAD_TITLE_MAX, truncateText } from "../../src/lib/truncate.js";
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
import { pressRelocate, relocateCallbacks } from "../helpers/confirmRelocate.js";
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
    await pressRelocate(bot, calls, "new");

    expect(methodsOf(calls)).toEqual([
      "sendMessage",
      "answerCallbackQuery",
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

    const jobs = await listRelocationJobs(handle.db);
    expect(jobs.map((job) => job.phase)).toEqual(["completed"]);
    const threads = await listThreads(handle.db);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      targetChatId: TARGET_CHAT_ID,
      rootMessageId: headerId,
      threadTitle: ROOT.text,
      titleSource: "truncated",
      initiatorUserId: ROOT.fromUserId,
    });
  });

  it("A2_single_message cleans up without copying replies", async () => {
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "new");
    expect(methodsOf(calls)).toEqual([
      "sendMessage",
      "answerCallbackQuery",
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
    expect((await listRelocationJobs(handle.db))[0]?.phase).toBe("completed");
  });

  it("A3_match_failure_safe does not delete", async () => {
    await bot.handleUpdate(
      forwardUpdate(1, 201, { ...ROOT, text: "never stored" }),
    );
    await flushRelocate(bot);

    expect(methodsOf(calls)).toEqual(["sendMessage"]);
    expect(calls[0]?.payload.text).toBe(renderMatchFailure());
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
    await pressRelocate(bot, calls, "new");

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
    await pressRelocate(bot, calls, "new");

    expect(calls.filter((call) => call.method === "deleteMessages")).toEqual([
      expect.objectContaining({
        payload: { chat_id: TARGET_CHAT_ID, message_ids: [201, 202] },
      }),
    ]);
    expect(calls.at(-1)?.payload.text).toBe(renderRelocateAborted("populated"));
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
    await pressRelocate(bot, calls, "new");
    const headerId = assertHappyRelocate(calls, {
      title: `Hello <b> & "x"`,
      copyMessageIds: [],
      sourceMessageIds: [nasty.messageId],
      triggerMessageIds: [201],
    });
    const threads = await listThreads(handle.db);
    expect(threads[0]).toMatchObject({
      rootMessageId: headerId,
      threadTitle: `Hello <b> & "x"`,
    });
  });

  it("renders the header and the source notice in each chat's language", async () => {
    await setChatLocale(handle.db, TARGET_CHAT_ID, "ru");
    await setChatLocale(handle.db, SOURCE_CHAT_ID, "es");
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "new");

    assertHappyRelocate(calls, {
      title: ROOT.text!,
      copyMessageIds: [],
      sourceMessageIds: [ROOT.messageId],
      triggerMessageIds: [201],
    });
  });

  it("uses the media fallback when the root has no text", async () => {
    const media: Original = { ...ROOT, text: null };
    const title = resolveRootTitles(null, null).threadTitle;
    await deliverCluster(bot, [media]);
    await pressRelocate(bot, calls, "new");
    assertHappyRelocate(calls, {
      title,
      copyMessageIds: [],
      sourceMessageIds: [media.messageId],
      triggerMessageIds: [201],
    });
  });

  it("truncates a long root into the header title", async () => {
    const long = "a".repeat(200);
    const title = truncateText(long, THREAD_TITLE_MAX);
    await deliverCluster(bot, [{ ...ROOT, text: long }]);
    await pressRelocate(bot, calls, "new");
    assertHappyRelocate(calls, {
      title,
      copyMessageIds: [],
      sourceMessageIds: [ROOT.messageId],
      triggerMessageIds: [201],
    });
    expect(title.length).toBeLessThanOrEqual(THREAD_TITLE_MAX);
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
    const confirms = relocateCallbacks(calls, "new");
    await pressRelocate(bot, calls, "new", { data: confirms[0], moderatorId: 7 });
    await pressRelocate(bot, calls, "new", { data: confirms[1], moderatorId: 8 });

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

  it("asks for confirmation and does not post a header until the button", async () => {
    await deliverCluster(bot, [ROOT, REPLY_ONE]);

    expect(calls.some((call) => call.method === "copyMessage")).toBe(false);
    expect(await listThreads(handle.db)).toHaveLength(0);
    expect(calls[0]?.payload.text).toBe(
      renderConfirmPrompt({
        count: 2,
        threadTitle: ROOT.text!,
        lines: [
          renderPreviewLine("Ada Lovelace", ROOT.text!),
          renderPreviewLine("Grace", REPLY_ONE.text!),
        ],
        hiddenCount: 0,
      }),
    );
    expect(relocateCallbacks(calls, "new")).toHaveLength(1);
    expect(relocateCallbacks(calls, "title")).toHaveLength(1);
    expect(relocateCallbacks(calls, "attach")).toHaveLength(1);
    expect(relocateCallbacks(calls, "drop")).toHaveLength(1);
  });

  it("counts preview lines that do not fit", () => {
    const text = renderConfirmPrompt({
      count: 10,
      threadTitle: "Topic",
      lines: ["Ada: hi"],
      hiddenCount: 2,
    });
    expect(text).toContain("10");
    expect(text).toContain("Topic");
    expect(text).toContain("Ada: hi");
    expect(text).toContain("2");
  });

  it("folds a later burst into the open draft and posts the question again", async () => {
    await deliverCluster(bot, [ROOT]);
    await bot.handleUpdate(sourceUpdate(50, REPLY_ONE));
    await bot.handleUpdate(forwardUpdate(51, 301, REPLY_ONE, 7));
    await flushRelocate(bot);

    expect(calls.filter((call) => call.method === "deleteMessage")).toHaveLength(1);
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(2);
    expect(calls.at(-1)?.payload.text).toBe(
      renderConfirmPrompt({
        count: 2,
        threadTitle: ROOT.text!,
        lines: [
          renderPreviewLine("Ada Lovelace", ROOT.text!),
          renderPreviewLine("Grace", REPLY_ONE.text!),
        ],
        hiddenCount: 0,
      }),
    );
    expect(calls.some((call) => call.method === "copyMessage")).toBe(false);
  });

  it("uses a custom title in full for the header and the source notice", async () => {
    const custom = `Custom ${"c".repeat(180)}`;
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "title");
    await bot.handleUpdate({
      update_id: 80,
      message: {
        message_id: 400,
        date: 1_700_000_800,
        chat: { id: TARGET_CHAT_ID, type: "supergroup", title: "Helper" },
        from: { id: 7, is_bot: false, first_name: "Mod" },
        text: custom,
      },
    });

    assertHappyRelocate(calls, {
      title: custom,
      copyMessageIds: [],
      sourceMessageIds: [ROOT.messageId],
      triggerMessageIds: [201],
    });
    expect((await listThreads(handle.db))[0]).toMatchObject({
      threadTitle: custom,
      titleSource: "custom",
    });
    expect(custom.length).toBeGreaterThan(THREAD_TITLE_MAX);
  });

  it("attaches the bundle to a previous thread", async () => {
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "new");
    const headerId = (await listThreads(handle.db))[0]?.rootMessageId;

    await bot.handleUpdate(sourceUpdate(60, REPLY_ONE));
    await bot.handleUpdate(forwardUpdate(61, 401, REPLY_ONE, 7));
    await flushRelocate(bot);
    await pressRelocate(bot, calls, "attach");
    await pressRelocate(bot, calls, "pick");

    expect(await listThreads(handle.db)).toHaveLength(1);
    const copies = calls.filter((call) => call.method === "copyMessage");
    expect(copies.at(-1)?.payload).toMatchObject({
      chat_id: TARGET_CHAT_ID,
      from_chat_id: SOURCE_CHAT_ID,
      message_id: REPLY_ONE.messageId,
      reply_parameters: { message_id: headerId },
    });
    const sourceDeletes = calls.filter(
      (call) =>
        call.method === "deleteMessages" && call.payload.chat_id === SOURCE_CHAT_ID,
    );
    expect(sourceDeletes.at(-1)?.payload.message_ids).toEqual([REPLY_ONE.messageId]);
  });

  it("ignores a confirmation button from someone else", async () => {
    await deliverCluster(bot, [ROOT]);
    await pressRelocate(bot, calls, "new", { moderatorId: 8 });

    expect(await listThreads(handle.db)).toHaveLength(0);
    expect(calls.some((call) => call.method === "deleteMessages")).toBe(false);
    expect(calls.filter((call) => call.method === "sendMessage")).toHaveLength(1);
  });

  it("drops the question when a later forward makes the bundle unmatchable", async () => {
    await deliverCluster(bot, [ROOT]);
    await bot.handleUpdate(
      forwardUpdate(70, 501, { ...ROOT, text: "never stored" }, 7),
    );
    await flushRelocate(bot);

    expect(calls.filter((call) => call.method === "deleteMessage")).toHaveLength(1);
    expect(calls.at(-1)?.payload.text).toBe(renderMatchFailure());
    expect(calls.some((call) => call.method === "deleteMessages")).toBe(false);
    expect(await findMessage(handle.db, SOURCE_CHAT_ID, ROOT.messageId)).toBeTruthy();
    expect(await listThreads(handle.db)).toHaveLength(0);
  });

  it("deletes the grouped forwards and cancels the thread", async () => {
    await deliverCluster(bot, [ROOT, REPLY_ONE]);
    await pressRelocate(bot, calls, "drop");

    const deleted = calls.filter((call) => call.method === "deleteMessages");
    expect(deleted).toHaveLength(1);
    expect(deleted[0]?.payload).toMatchObject({ chat_id: TARGET_CHAT_ID });
    expect(deleted[0]?.payload.message_ids).toEqual(expect.arrayContaining([201, 202]));
    expect(deleted[0]?.payload.message_ids).toHaveLength(3);
    expect(await listThreads(handle.db)).toHaveLength(0);
    expect(await findMessage(handle.db, SOURCE_CHAT_ID, ROOT.messageId)).toBeTruthy();
    expect((await listRelocationJobs(handle.db))[0]).toMatchObject({
      phase: "aborted",
      payload: { reason: "cancelled" },
    });
  });
});

describe("RelocationDraftStore", () => {
  it("remaps an open draft onto the new supergroup id", () => {
    const store = new RelocationDraftStore();
    const draft = store.create({
      targetChatId: 1,
      moderatorUserId: 7,
      plan: {
        pair: {
          id: 1,
          sourceChatId: 2,
          targetChatId: 1,
          sourceTitle: null,
          targetTitle: null,
          sourceUsernameOrPath: null,
          configuredByUserId: 1,
          aiTitlesEnabled: false,
          enabled: true,
        },
        items: [
          {
            targetChatId: 1,
            targetTitle: null,
            targetUsername: null,
            moderatorUserId: 7,
            triggerMessageId: 5,
            text: "hi",
            caption: null,
            fingerprint: "fp",
            origin: null,
          },
        ],
        resolved: [],
        threadTitle: "hi",
      },
    });

    expect(store.remapChatId(1, 9)).toBe(1);
    expect(store.getByKey(9, 7)?.id).toBe(draft.id);
    expect(store.getByKey(1, 7)).toBeUndefined();
    expect(store.getByKey(9, 7)?.plan.pair.targetChatId).toBe(9);
    expect(store.getByKey(9, 7)?.plan.items[0]?.targetChatId).toBe(9);
  });
});
