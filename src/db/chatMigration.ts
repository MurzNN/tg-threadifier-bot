import { and, eq, inArray } from "drizzle-orm";

import { disableOtherEnabledPairsForTarget } from "./chatPairs.js";
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
 * Remap source or target on a pair. If another row already owns the resulting
 * (source, target), disable this row instead of creating a duplicate key pair.
 */
async function remapPairSide(
  db: AppDb,
  pair: typeof chatPairs.$inferSelect,
  side: "source" | "target",
  newChatId: number,
): Promise<"updated" | "disabled"> {
  const nextSource =
    side === "source" ? newChatId : pair.sourceChatId;
  const nextTarget =
    side === "target" ? newChatId : pair.targetChatId;

  const colliding = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.sourceChatId, nextSource),
        eq(chatPairs.targetChatId, nextTarget),
      ),
    )
    .limit(1);

  if (colliding[0] && colliding[0].id !== pair.id) {
    if (pair.enabled) {
      await db
        .update(chatPairs)
        .set({ enabled: false })
        .where(eq(chatPairs.id, pair.id));
    }
    if (colliding[0].enabled) {
      await disableOtherEnabledPairsForTarget(
        db,
        colliding[0].targetChatId,
        colliding[0].id,
      );
    }
    return "disabled";
  }

  await db
    .update(chatPairs)
    .set(side === "source" ? { sourceChatId: newChatId } : { targetChatId: newChatId })
    .where(eq(chatPairs.id, pair.id));

  if (pair.enabled) {
    await disableOtherEnabledPairsForTarget(db, nextTarget, pair.id);
  }
  return "updated";
}

/**
 * Rewrite a Telegram chat id after a group → supergroup upgrade.
 * Idempotent: a second call with the same ids updates zero rows.
 * When remapping would collide with an existing (source, target) row, the
 * remapped row is soft-disabled and the existing row kept.
 */
export async function remapChatId(
  db: AppDb,
  oldChatId: number,
  newChatId: number,
): Promise<ChatIdRemapResult> {
  if (oldChatId === newChatId) {
    return { chatPairs: 0, messages: 0, threads: 0, relocationJobs: 0 };
  }

  const asSource = await db
    .select()
    .from(chatPairs)
    .where(eq(chatPairs.sourceChatId, oldChatId));
  const asTarget = await db
    .select()
    .from(chatPairs)
    .where(eq(chatPairs.targetChatId, oldChatId));

  const touchedPairIds = new Set<number>();
  for (const pair of asSource) {
    const result = await remapPairSide(db, pair, "source", newChatId);
    if (result === "updated" || result === "disabled") {
      touchedPairIds.add(pair.id);
    }
  }
  for (const pair of asTarget) {
    // May already have been rewritten when it was also the source (rare).
    const fresh = await db
      .select()
      .from(chatPairs)
      .where(eq(chatPairs.id, pair.id))
      .limit(1);
    const current = fresh[0];
    if (!current || current.targetChatId !== oldChatId) continue;
    const result = await remapPairSide(db, current, "target", newChatId);
    if (result === "updated" || result === "disabled") {
      touchedPairIds.add(pair.id);
    }
  }

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
    chatPairs: touchedPairIds.size,
    messages: movedMessages.length,
    threads: movedThreads.length,
    relocationJobs: relocationUpdated,
  };
}
