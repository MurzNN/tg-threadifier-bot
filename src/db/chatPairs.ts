import { and, asc, desc, eq, or } from "drizzle-orm";

import type { AppDb } from "./client.js";
import { chatPairs } from "./schema.js";

export type ChatPair = {
  id: number;
  sourceChatId: number;
  targetChatId: number;
  sourceTitle: string | null;
  targetTitle: string | null;
  sourceUsernameOrPath: string | null;
  aiTitlesEnabled: boolean;
  enabled: boolean;
};

export type UpsertPairInput = {
  sourceChatId: number;
  targetChatId: number;
  sourceTitle?: string | null;
  targetTitle?: string | null;
  sourceUsernameOrPath?: string | null;
  enabled?: boolean;
};

function mapRow(row: typeof chatPairs.$inferSelect): ChatPair {
  return {
    id: row.id,
    sourceChatId: row.sourceChatId,
    targetChatId: row.targetChatId,
    sourceTitle: row.sourceTitle,
    targetTitle: row.targetTitle,
    sourceUsernameOrPath: row.sourceUsernameOrPath,
    aiTitlesEnabled: row.aiTitlesEnabled,
    enabled: row.enabled,
  };
}

/** Upsert a single enabled pair (v1: one active community pair is enough). */
export async function upsertChatPair(
  db: AppDb,
  input: UpsertPairInput,
): Promise<ChatPair> {
  const existing = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.sourceChatId, input.sourceChatId),
        eq(chatPairs.targetChatId, input.targetChatId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(chatPairs)
      .set({
        sourceTitle: input.sourceTitle ?? existing[0].sourceTitle,
        targetTitle: input.targetTitle ?? existing[0].targetTitle,
        sourceUsernameOrPath:
          input.sourceUsernameOrPath ?? existing[0].sourceUsernameOrPath,
        enabled: input.enabled ?? true,
      })
      .where(eq(chatPairs.id, existing[0].id));
    const refreshed = await db
      .select()
      .from(chatPairs)
      .where(eq(chatPairs.id, existing[0].id))
      .limit(1);
    return mapRow(refreshed[0]!);
  }

  const inserted = await db
    .insert(chatPairs)
    .values({
      sourceChatId: input.sourceChatId,
      targetChatId: input.targetChatId,
      sourceTitle: input.sourceTitle ?? null,
      targetTitle: input.targetTitle ?? null,
      sourceUsernameOrPath: input.sourceUsernameOrPath ?? null,
      enabled: input.enabled ?? true,
    })
    .returning();
  return mapRow(inserted[0]!);
}

export async function listEnabledPairs(db: AppDb): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(eq(chatPairs.enabled, true));
  return rows.map(mapRow);
}

/** Every stored pair, including ones disabled with `/unpair`. */
export async function listChatPairs(db: AppDb): Promise<ChatPair[]> {
  const rows = await db.select().from(chatPairs).orderBy(asc(chatPairs.id));
  return rows.map(mapRow);
}

/** Pairs that include this chat. Enabled rows come first. */
export async function listPairsForChat(
  db: AppDb,
  chatId: number,
): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(
      or(
        eq(chatPairs.sourceChatId, chatId),
        eq(chatPairs.targetChatId, chatId),
      ),
    )
    .orderBy(desc(chatPairs.enabled), asc(chatPairs.id));
  return rows.map(mapRow);
}

export async function findEnabledPairByTarget(
  db: AppDb,
  targetChatId: number,
): Promise<ChatPair | undefined> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.enabled, true),
        eq(chatPairs.targetChatId, targetChatId),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function findEnabledPairForChat(
  db: AppDb,
  chatId: number,
): Promise<ChatPair | undefined> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.enabled, true),
        or(
          eq(chatPairs.sourceChatId, chatId),
          eq(chatPairs.targetChatId, chatId),
        ),
      ),
    )
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function disablePairsForChat(
  db: AppDb,
  chatId: number,
): Promise<number> {
  const result = await db
    .update(chatPairs)
    .set({ enabled: false })
    .where(
      or(
        eq(chatPairs.sourceChatId, chatId),
        eq(chatPairs.targetChatId, chatId),
      ),
    )
    .returning();
  return result.length;
}

/** In-memory draft while an admin sets source then target via `/pair`. */
export type PairDraft = {
  sourceChatId?: number;
  targetChatId?: number;
  sourceTitle?: string | null;
  targetTitle?: string | null;
  sourceUsernameOrPath?: string | null;
};

export class PairDraftStore {
  #byOperator = new Map<number, PairDraft>();

  get(operatorId: number): PairDraft {
    return this.#byOperator.get(operatorId) ?? {};
  }

  set(operatorId: number, draft: PairDraft): void {
    this.#byOperator.set(operatorId, draft);
  }

  clear(operatorId: number): void {
    this.#byOperator.delete(operatorId);
  }

  /** Rewrite in-flight `/pair` drafts when a group upgrades to a supergroup. */
  remapChatId(oldChatId: number, newChatId: number): number {
    let updated = 0;
    for (const [operatorId, draft] of this.#byOperator) {
      let changed = false;
      const next = { ...draft };
      if (next.sourceChatId === oldChatId) {
        next.sourceChatId = newChatId;
        changed = true;
      }
      if (next.targetChatId === oldChatId) {
        next.targetChatId = newChatId;
        changed = true;
      }
      if (changed) {
        this.#byOperator.set(operatorId, next);
        updated += 1;
      }
    }
    return updated;
  }
}
