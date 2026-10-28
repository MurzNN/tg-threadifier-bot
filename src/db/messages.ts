import { sql } from "drizzle-orm";

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

export async function countMessages(db: AppDb): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(messages);
  return Number(rows[0]?.count ?? 0);
}
