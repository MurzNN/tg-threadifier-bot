import { and, eq, sql } from "drizzle-orm";

import type { AppDb } from "./client.js";
import { messages } from "./schema.js";

export type StoredMessage = {
  chatId: number;
  messageId: number;
  fromUserId: number | null;
  date: number;
  text: string | null;
  caption: string | null;
  contentFingerprint: string | null;
  replyToMessageId: number | null;
  forwardOrigin: string | null;
  raw: unknown;
};

function mapMessage(row: typeof messages.$inferSelect): StoredMessage {
  return {
    chatId: row.chatId,
    messageId: row.messageId,
    fromUserId: row.fromUserId,
    date: row.date,
    text: row.text,
    caption: row.caption,
    contentFingerprint: row.contentFingerprint,
    replyToMessageId: row.replyToMessageId,
    forwardOrigin: row.forwardOrigin,
    raw: row.raw,
  };
}

export async function upsertMessage(
  db: AppDb,
  message: StoredMessage,
): Promise<void> {
  await db
    .insert(messages)
    .values({
      chatId: message.chatId,
      messageId: message.messageId,
      fromUserId: message.fromUserId,
      date: message.date,
      text: message.text,
      caption: message.caption,
      contentFingerprint: message.contentFingerprint,
      replyToMessageId: message.replyToMessageId,
      forwardOrigin: message.forwardOrigin,
      raw: message.raw,
    })
    .onConflictDoUpdate({
      target: [messages.chatId, messages.messageId],
      set: {
        fromUserId: message.fromUserId,
        date: message.date,
        text: message.text,
        caption: message.caption,
        contentFingerprint: message.contentFingerprint,
        replyToMessageId: message.replyToMessageId,
        forwardOrigin: message.forwardOrigin,
        raw: message.raw,
      },
    });
}

export async function findMessage(
  db: AppDb,
  chatId: number,
  messageId: number,
): Promise<StoredMessage | undefined> {
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.chatId, chatId), eq(messages.messageId, messageId)))
    .limit(1);
  return rows[0] ? mapMessage(rows[0]) : undefined;
}

/** Candidates for a non-channel forward: same chat, original date, and fingerprint. */
export async function findMessagesByContent(
  db: AppDb,
  chatId: number,
  date: number,
  contentFingerprint: string,
): Promise<StoredMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.chatId, chatId),
        eq(messages.date, date),
        eq(messages.contentFingerprint, contentFingerprint),
      ),
    );
  return rows.map(mapMessage);
}

export async function countMessages(db: AppDb): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(messages);
  return Number(rows[0]?.count ?? 0);
}
