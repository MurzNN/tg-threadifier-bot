import type { ApiCallFn, Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createBot } from "../../src/bot.js";
import { readChatMigration } from "../../src/bot/chatMigration.js";
import {
  listChatPairs,
  listEnabledPairs,
  PairDraftStore,
  upsertChatPair,
} from "../../src/db/chatPairs.js";
import { getChatLocale, setChatLocale } from "../../src/db/chatSettings.js";
import { remapChatId } from "../../src/db/chatMigration.js";
import type { DbHandle } from "../../src/db/client.js";
import {
  countMessages,
  findMessage,
  upsertMessage,
} from "../../src/db/messages.js";
import {
  insertRelocationJob,
  insertThread,
  listRelocationJobs,
  listThreads,
} from "../../src/db/relocation.js";
import { chatPairs } from "../../src/db/schema.js";
import { createLogger } from "../../src/logger.js";
import { createTestDb } from "../helpers/db.js";

const OLD_GROUP = -123456;
const NEW_SUPERGROUP = -1001234567890;
const OTHER = -1009876543210;

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

describe("readChatMigration", () => {
  it("reads migrate_to_chat_id from the old group", () => {
    expect(
      readChatMigration({ migrate_to_chat_id: NEW_SUPERGROUP }, OLD_GROUP),
    ).toEqual({ oldChatId: OLD_GROUP, newChatId: NEW_SUPERGROUP });
  });

  it("reads migrate_from_chat_id from the new supergroup", () => {
    expect(
      readChatMigration({ migrate_from_chat_id: OLD_GROUP }, NEW_SUPERGROUP),
    ).toEqual({ oldChatId: OLD_GROUP, newChatId: NEW_SUPERGROUP });
  });

  it("ignores ordinary messages", () => {
    expect(readChatMigration({ text: "hello" } as never, OLD_GROUP)).toBeNull();
  });
});

describe("remapChatId", () => {
  let handle: DbHandle;

  beforeEach(async () => {
    handle = await createTestDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("rewrites pairs, messages, threads, and relocation payloads", async () => {
    const pair = await upsertChatPair(handle.db, {
      sourceChatId: OLD_GROUP,
      targetChatId: OTHER,
      configuredByUserId: 1,
      enabled: true,
    });
    await upsertMessage(handle.db, {
      chatId: OLD_GROUP,
      messageId: 10,
      fromUserId: 9,
      date: 1_700_000_100,
      text: "keep me",
      caption: null,
      contentFingerprint: "fp",
      replyToMessageId: null,
      forwardOrigin: null,
      raw: {},
    });
    await upsertMessage(handle.db, {
      chatId: OLD_GROUP,
      messageId: 11,
      fromUserId: 9,
      date: 1_700_000_101,
      text: "old copy",
      caption: null,
      contentFingerprint: "fp2",
      replyToMessageId: null,
      forwardOrigin: null,
      raw: {},
    });
    await upsertMessage(handle.db, {
      chatId: NEW_SUPERGROUP,
      messageId: 11,
      fromUserId: 9,
      date: 1_700_000_101,
      text: "already under new id",
      caption: null,
      contentFingerprint: "fp2",
      replyToMessageId: null,
      forwardOrigin: null,
      raw: {},
    });
    await insertThread(handle.db, {
      targetChatId: OLD_GROUP,
      rootMessageId: 800,
      threadTitle: "topic",
      topicLabel: "topic",
      titleSource: "truncated",
      initiatorUserId: 9,
    });
    await insertRelocationJob(handle.db, {
      chatPairId: pair.id,
      phase: "pending",
      payload: {
        moderatorUserId: 7,
        sourceChatId: OLD_GROUP,
        targetChatId: OTHER,
      },
    });

    const result = await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect(result).toEqual({
      chatPairs: 1,
      messages: 1,
      threads: 1,
      relocationJobs: 1,
      chatSettings: 0,
    });

    const pairs = await listEnabledPairs(handle.db);
    expect(pairs[0]).toMatchObject({
      sourceChatId: NEW_SUPERGROUP,
      targetChatId: OTHER,
    });
    expect(await findMessage(handle.db, NEW_SUPERGROUP, 10)).toMatchObject({
      text: "keep me",
    });
    expect(await findMessage(handle.db, NEW_SUPERGROUP, 11)).toMatchObject({
      text: "already under new id",
    });
    expect(await findMessage(handle.db, OLD_GROUP, 10)).toBeUndefined();
    expect(await countMessages(handle.db)).toBe(2);
    expect((await listThreads(handle.db))[0]?.targetChatId).toBe(NEW_SUPERGROUP);
    expect((await listRelocationJobs(handle.db))[0]?.payload).toMatchObject({
      sourceChatId: NEW_SUPERGROUP,
      targetChatId: OTHER,
    });

    const again = await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect(again).toEqual({
      chatPairs: 0,
      messages: 0,
      threads: 0,
      relocationJobs: 0,
      chatSettings: 0,
    });
  });

  it("rewrites a target chat id in a pair", async () => {
    await upsertChatPair(handle.db, {
      sourceChatId: OTHER,
      targetChatId: OLD_GROUP,
      configuredByUserId: 1,
      enabled: true,
    });
    await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect((await listEnabledPairs(handle.db))[0]).toMatchObject({
      sourceChatId: OTHER,
      targetChatId: NEW_SUPERGROUP,
    });
  });

  it("disables a remapped pair that would collide with an existing row", async () => {
    const kept = await upsertChatPair(handle.db, {
      sourceChatId: NEW_SUPERGROUP,
      targetChatId: OTHER,
      configuredByUserId: 1,
      enabled: true,
    });
    // Legacy row still pointing at the pre-upgrade source id (bypasses upsert).
    const [stale] = await handle.db
      .insert(chatPairs)
      .values({
        sourceChatId: OLD_GROUP,
        targetChatId: OTHER,
        configuredByUserId: 1,
        enabled: true,
      })
      .returning();

    const result = await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect(result.chatPairs).toBe(1);

    const enabled = await listEnabledPairs(handle.db);
    expect(enabled).toHaveLength(1);
    expect(enabled[0]?.id).toBe(kept.id);
    expect(enabled[0]).toMatchObject({
      sourceChatId: NEW_SUPERGROUP,
      targetChatId: OTHER,
    });

    const all = await listChatPairs(handle.db);
    expect(all.find((pair) => pair.id === stale!.id)?.enabled).toBe(false);
    expect(all.find((pair) => pair.id === stale!.id)?.sourceChatId).toBe(
      OLD_GROUP,
    );
  });

  it("moves the chat language onto the supergroup id", async () => {
    await setChatLocale(handle.db, OLD_GROUP, "fr");
    const result = await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect(result.chatSettings).toBe(1);
    expect(await getChatLocale(handle.db, NEW_SUPERGROUP)).toBe("fr");
    expect(await getChatLocale(handle.db, OLD_GROUP)).toBeNull();

    await setChatLocale(handle.db, OLD_GROUP, "es");
    await setChatLocale(handle.db, NEW_SUPERGROUP, "ru");
    await remapChatId(handle.db, OLD_GROUP, NEW_SUPERGROUP);
    expect(await getChatLocale(handle.db, NEW_SUPERGROUP)).toBe("ru");
    expect(await getChatLocale(handle.db, OLD_GROUP)).toBeNull();
  });
});

describe("PairDraftStore.remapChatId", () => {
  it("updates in-flight drafts", () => {
    const drafts = new PairDraftStore();
    drafts.set(1, { sourceChatId: OLD_GROUP, targetChatId: OTHER });
    drafts.set(2, { sourceChatId: OTHER, targetChatId: OLD_GROUP });
    drafts.set(3, { sourceChatId: OTHER, targetChatId: -1 });
    expect(drafts.remapChatId(OLD_GROUP, NEW_SUPERGROUP)).toBe(2);
    expect(drafts.get(1)).toEqual({
      sourceChatId: NEW_SUPERGROUP,
      targetChatId: OTHER,
    });
    expect(drafts.get(2)).toEqual({
      sourceChatId: OTHER,
      targetChatId: NEW_SUPERGROUP,
    });
    expect(drafts.get(3)).toEqual({ sourceChatId: OTHER, targetChatId: -1 });
  });
});

describe("chat migration middleware", () => {
  let bot: Bot;
  let handle: DbHandle;
  let drafts: PairDraftStore;

  beforeEach(async () => {
    handle = await createTestDb();
    drafts = new PairDraftStore();
    await upsertChatPair(handle.db, {
      sourceChatId: OLD_GROUP,
      targetChatId: OTHER,
      configuredByUserId: 1,
      enabled: true,
    });
    drafts.set(1, { sourceChatId: OLD_GROUP });
    const logger = createLogger({ LOG_LEVEL: "silent", NODE_ENV: "test" });
    bot = createBot({
      token: "test:token",
      logger,
      db: handle.db,
      pairDrafts: drafts,
    });
    bot.botInfo = botInfo;
    bot.api.config.use(async () => {
      return { ok: true, result: true } as Awaited<ReturnType<ApiCallFn>>;
    });
    await bot.init();
  });

  afterEach(async () => {
    await handle.close();
  });

  it("applies migrate_to_chat_id from the old group", async () => {
    await bot.handleUpdate({
      update_id: 1,
      message: {
        message_id: 1,
        date: 1_700_000_100,
        chat: { id: OLD_GROUP, type: "group", title: "Main" },
        from: { id: 777000, is_bot: true, first_name: "Telegram" },
        migrate_to_chat_id: NEW_SUPERGROUP,
      },
    });

    expect((await listEnabledPairs(handle.db))[0]?.sourceChatId).toBe(
      NEW_SUPERGROUP,
    );
    expect(drafts.get(1).sourceChatId).toBe(NEW_SUPERGROUP);
  });

  it("applies migrate_from_chat_id from the new supergroup", async () => {
    await bot.handleUpdate({
      update_id: 2,
      message: {
        message_id: 1,
        date: 1_700_000_100,
        chat: { id: NEW_SUPERGROUP, type: "supergroup", title: "Main" },
        from: { id: 777000, is_bot: true, first_name: "Telegram" },
        migrate_from_chat_id: OLD_GROUP,
      },
    });

    expect((await listEnabledPairs(handle.db))[0]?.sourceChatId).toBe(
      NEW_SUPERGROUP,
    );
  });
});
