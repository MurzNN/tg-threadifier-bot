import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Single PostgreSQL schema (SSOT).
 * Local/Test DC: PGlite (Postgres-compatible, in-process).
 * Helm/prod: real Postgres via DATABASE_URL.
 */

export const messages = pgTable(
  "messages",
  {
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    messageId: integer("message_id").notNull(),
    fromUserId: bigint("from_user_id", { mode: "number" }),
    date: integer("date").notNull(),
    text: text("text"),
    caption: text("caption"),
    contentFingerprint: text("content_fingerprint"),
    replyToMessageId: integer("reply_to_message_id"),
    forwardOrigin: text("forward_origin"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("messages_chat_message_uidx").on(t.chatId, t.messageId)],
);

export const chatPairs = pgTable("chat_pairs", {
  id: serial("id").primaryKey(),
  sourceChatId: bigint("source_chat_id", { mode: "number" }).notNull(),
  targetChatId: bigint("target_chat_id", { mode: "number" }).notNull(),
  sourceTitle: text("source_title"),
  targetTitle: text("target_title"),
  sourceUsernameOrPath: text("source_username_or_path"),
  /** Telegram user who configured this pair. */
  configuredByUserId: bigint("configured_by_user_id", { mode: "number" }).notNull(),
  aiTitlesEnabled: boolean("ai_titles_enabled").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const threads = pgTable(
  "threads",
  {
    id: serial("id").primaryKey(),
    targetChatId: bigint("target_chat_id", { mode: "number" }).notNull(),
    rootMessageId: integer("root_message_id").notNull(),
    threadTitle: text("thread_title").notNull(),
    titleSource: text("title_source").notNull().default("truncated"),
    initiatorUserId: bigint("initiator_user_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("threads_target_created_idx").on(t.targetChatId, t.createdAt)],
);

/**
 * One row per Telegram user. Add further settings as columns.
 * `locale` is the fallback command language when the chat has none.
 */
export const userSettings = pgTable("user_settings", {
  userId: bigint("user_id", { mode: "number" }).primaryKey(),
  locale: text("locale").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

/**
 * One row per Telegram chat. Add further settings as columns.
 * `locale` is the command language for this chat.
 */
export const chatSettings = pgTable("chat_settings", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  locale: text("locale").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const relocationJobs = pgTable("relocation_jobs", {
  id: serial("id").primaryKey(),
  chatPairId: integer("chat_pair_id").notNull(),
  phase: text("phase").notNull().default("pending"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
});

export const schema = {
  messages,
  chatPairs,
  threads,
  userSettings,
  chatSettings,
  relocationJobs,
};
