import { and, eq, inArray } from "drizzle-orm";

import type { AppDb } from "./client.js";
import type { RelocationPayload } from "./relocation.js";
import { chatPairs, messages, relocationJobs, threads } from "./schema.js";

export type ChatIdRemapResult = {
  chatPairs: number;
  messages: number;
  threads: number;
  relocationJobs: number;
};

/**
 * Rewrite a Telegram chat id after a group → supergroup upgrade.
 * Idempotent: a second call with the same ids updates zero rows.
 */
export async function remapChatId(
  db: AppDb,
  oldChatId: number,
  newChatId: number,
): Promise<ChatIdRemapResult> {
  if (oldChatId === newChatId) {
    return { chatPairs: 0, messages: 0, threads: 0, relocationJobs: 0 };
  }

  const sourcePairs = await db
    .update(chatPairs)
    .set({ sourceChatId: newChatId })
    .where(eq(chatPairs.sourceChatId, oldChatId))
    .returning();
  const targetPairs = await db
    .update(chatPairs)
    .set({ targetChatId: newChatId })
    .where(eq(chatPairs.targetChatId, oldChatId))
    .returning();

  // Prefer rows already stored under the new id; drop colliding old rows.
  const oldMessageIds = (
    await db
      .select({ messageId: messages.messageId })
      .from(messages)
      .where(eq(messages.chatId, oldChatId))
  ).map((row) => row.messageId);
  if (oldMessageIds.length > 0) {
    const newMessageIds = new Set(
      (
        await db
          .select({ messageId: messages.messageId })
          .from(messages)
          .where(eq(messages.chatId, newChatId))
      ).map((row) => row.messageId),
    );
    const colliding = oldMessageIds.filter((id) => newMessageIds.has(id));
    if (colliding.length > 0) {
      await db
        .delete(messages)
        .where(
          and(
            eq(messages.chatId, oldChatId),
            inArray(messages.messageId, colliding),
          ),
        );
    }
  }
  const movedMessages = await db
    .update(messages)
    .set({ chatId: newChatId })
    .where(eq(messages.chatId, oldChatId))
    .returning();

  const movedThreads = await db
    .update(threads)
    .set({ targetChatId: newChatId })
    .where(eq(threads.targetChatId, oldChatId))
    .returning();

  const jobs = await db.select().from(relocationJobs);
  let relocationUpdated = 0;
  for (const job of jobs) {
    const payload = (job.payload ?? {}) as RelocationPayload;
    let changed = false;
    const next: RelocationPayload = { ...payload };
    if (next.sourceChatId === oldChatId) {
      next.sourceChatId = newChatId;
      changed = true;
    }
    if (next.targetChatId === oldChatId) {
      next.targetChatId = newChatId;
      changed = true;
    }
    if (!changed) continue;
    await db
      .update(relocationJobs)
      .set({ payload: next, updatedAt: new Date() })
      .where(eq(relocationJobs.id, job.id));
    relocationUpdated += 1;
  }

  return {
    chatPairs: new Set([
      ...sourcePairs.map((row) => row.id),
      ...targetPairs.map((row) => row.id),
    ]).size,
    messages: movedMessages.length,
    threads: movedThreads.length,
    relocationJobs: relocationUpdated,
  };
}
