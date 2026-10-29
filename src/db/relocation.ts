import { desc, eq } from "drizzle-orm";

import type { AppDb } from "./client.js";
import { relocationJobs, threads } from "./schema.js";

export const RELOCATION_PHASES = [
  "pending",
  "header_created",
  "populated",
  "target_cleaned",
  "source_cleaned",
  "completed",
  "aborted",
] as const;

export type RelocationPhase = (typeof RELOCATION_PHASES)[number];

export type RelocationItem = {
  sourceMessageId: number;
  triggerMessageId: number;
  date: number;
  fromUserId: number | null;
  text: string | null;
  caption: string | null;
  authorName: string;
};

export type RelocationPayload = {
  moderatorUserId: number;
  sourceChatId: number;
  targetChatId: number;
  triggerMessageIds?: number[];
  items?: RelocationItem[];
  headerMessageId?: number;
  threadLink?: string;
  reason?: string;
  error?: string;
  /** Last phase that committed before an abort. */
  stoppedAt?: RelocationPhase;
};

export type RelocationJob = {
  id: number;
  chatPairId: number;
  phase: string;
  payload: RelocationPayload;
};

export type StoredThread = {
  id: number;
  targetChatId: number;
  rootMessageId: number;
  threadTitle: string;
  titleSource: string;
  initiatorUserId: number | null;
};

function mapJob(row: typeof relocationJobs.$inferSelect): RelocationJob {
  return {
    id: row.id,
    chatPairId: row.chatPairId,
    phase: row.phase,
    payload: (row.payload ?? {}) as RelocationPayload,
  };
}

function mapThread(row: typeof threads.$inferSelect): StoredThread {
  return {
    id: row.id,
    targetChatId: row.targetChatId,
    rootMessageId: row.rootMessageId,
    threadTitle: row.threadTitle,
    titleSource: row.titleSource,
    initiatorUserId: row.initiatorUserId,
  };
}

export async function insertRelocationJob(
  db: AppDb,
  input: {
    chatPairId: number;
    phase: RelocationPhase;
    payload: RelocationPayload;
  },
): Promise<RelocationJob> {
  const rows = await db
    .insert(relocationJobs)
    .values({
      chatPairId: input.chatPairId,
      phase: input.phase,
      payload: input.payload,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("relocation job insert returned no row");
  return mapJob(row);
}

export async function updateRelocationJob(
  db: AppDb,
  id: number,
  phase: RelocationPhase,
  payload: RelocationPayload,
): Promise<void> {
  await db
    .update(relocationJobs)
    .set({ phase, payload, updatedAt: new Date() })
    .where(eq(relocationJobs.id, id));
}

export async function listRelocationJobs(db: AppDb): Promise<RelocationJob[]> {
  const rows = await db.select().from(relocationJobs).orderBy(relocationJobs.id);
  return rows.map(mapJob);
}

export async function insertThread(
  db: AppDb,
  input: {
    targetChatId: number;
    rootMessageId: number;
    threadTitle: string;
    titleSource: string;
    initiatorUserId: number | null;
  },
): Promise<StoredThread> {
  const rows = await db
    .insert(threads)
    .values({
      targetChatId: input.targetChatId,
      rootMessageId: input.rootMessageId,
      threadTitle: input.threadTitle,
      titleSource: input.titleSource,
      initiatorUserId: input.initiatorUserId,
    })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("thread insert returned no row");
  return mapThread(row);
}

export async function listThreads(db: AppDb): Promise<StoredThread[]> {
  const rows = await db.select().from(threads).orderBy(threads.id);
  return rows.map(mapThread);
}

export async function findThread(
  db: AppDb,
  id: number,
): Promise<StoredThread | undefined> {
  const rows = await db.select().from(threads).where(eq(threads.id, id)).limit(1);
  const row = rows[0];
  return row ? mapThread(row) : undefined;
}

/** Last threads in a target chat, newest first. Flow B and relocate attach use 5. */
export async function listRecentThreads(
  db: AppDb,
  targetChatId: number,
  limit = 5,
): Promise<StoredThread[]> {
  const rows = await db
    .select()
    .from(threads)
    .where(eq(threads.targetChatId, targetChatId))
    .orderBy(desc(threads.createdAt), desc(threads.id))
    .limit(limit);
  return rows.map(mapThread);
}
