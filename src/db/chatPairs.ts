import { and, asc, desc, eq, ne, or } from "drizzle-orm";

import type { AppDb } from "./client.js";
import { chatPairs } from "./schema.js";

export class PairOwnedByAnotherUserError extends Error {
  constructor() {
    super("This source and target are already paired by another user");
    this.name = "PairOwnedByAnotherUserError";
  }
}

export type ChatPair = {
  id: number;
  sourceChatId: number;
  targetChatId: number;
  sourceTitle: string | null;
  targetTitle: string | null;
  sourceUsernameOrPath: string | null;
  configuredByUserId: number;
  aiTitlesEnabled: boolean;
  enabled: boolean;
};

export type UpsertPairInput = {
  sourceChatId: number;
  targetChatId: number;
  configuredByUserId: number;
  sourceTitle?: string | null;
  targetTitle?: string | null;
  sourceUsernameOrPath?: string | null;
  enabled?: boolean;
};

export type DeletePairsForChatResult = {
  deleted: number;
  blocked: number;
};

function mapRow(row: typeof chatPairs.$inferSelect): ChatPair {
  return {
    id: row.id,
    sourceChatId: row.sourceChatId,
    targetChatId: row.targetChatId,
    sourceTitle: row.sourceTitle,
    targetTitle: row.targetTitle,
    sourceUsernameOrPath: row.sourceUsernameOrPath,
    configuredByUserId: row.configuredByUserId,
    aiTitlesEnabled: row.aiTitlesEnabled,
    enabled: row.enabled,
  };
}

/**
 * Soft-disable every other enabled pair that shares this target.
 * v1 keeps at most one enabled pair per target so relocate lookup is unambiguous.
 */
export async function disableOtherEnabledPairsForTarget(
  db: AppDb,
  targetChatId: number,
  keepPairId: number,
): Promise<number> {
  const result = await db
    .update(chatPairs)
    .set({ enabled: false })
    .where(
      and(
        eq(chatPairs.enabled, true),
        eq(chatPairs.targetChatId, targetChatId),
        // Keep the row we just upserted / remapped.
        ne(chatPairs.id, keepPairId),
      ),
    )
    .returning();
  return result.length;
}

/** Upsert a single enabled pair (v1: one active pair per target). */
export async function upsertChatPair(
  db: AppDb,
  input: UpsertPairInput,
): Promise<ChatPair> {
  const enabled = input.enabled ?? true;
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

  let pair: ChatPair;
  if (existing[0]) {
    if (existing[0].configuredByUserId !== input.configuredByUserId) {
      throw new PairOwnedByAnotherUserError();
    }
    await db
      .update(chatPairs)
      .set({
        sourceTitle: input.sourceTitle ?? existing[0].sourceTitle,
        targetTitle: input.targetTitle ?? existing[0].targetTitle,
        sourceUsernameOrPath:
          input.sourceUsernameOrPath ?? existing[0].sourceUsernameOrPath,
        enabled,
      })
      .where(eq(chatPairs.id, existing[0].id));
    const refreshed = await db
      .select()
      .from(chatPairs)
      .where(eq(chatPairs.id, existing[0].id))
      .limit(1);
    pair = mapRow(refreshed[0]!);
  } else {
    const inserted = await db
      .insert(chatPairs)
      .values({
        sourceChatId: input.sourceChatId,
        targetChatId: input.targetChatId,
        sourceTitle: input.sourceTitle ?? null,
        targetTitle: input.targetTitle ?? null,
        sourceUsernameOrPath: input.sourceUsernameOrPath ?? null,
        configuredByUserId: input.configuredByUserId,
        enabled,
      })
      .returning();
    pair = mapRow(inserted[0]!);
  }

  if (pair.enabled) {
    await disableOtherEnabledPairsForTarget(db, pair.targetChatId, pair.id);
  }
  return pair;
}

export async function listEnabledPairs(db: AppDb): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(eq(chatPairs.enabled, true));
  return rows.map(mapRow);
}

/** Every stored pair, including ones left disabled when a newer target pair is enabled. */
export async function listChatPairs(db: AppDb): Promise<ChatPair[]> {
  const rows = await db.select().from(chatPairs).orderBy(asc(chatPairs.id));
  return rows.map(mapRow);
}

/** Pairs configured by this user, including disabled rows. */
export async function listChatPairsForUser(
  db: AppDb,
  userId: number,
): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(eq(chatPairs.configuredByUserId, userId))
    .orderBy(asc(chatPairs.id));
  return rows.map(mapRow);
}

/** Enabled pairs configured by this user. */
export async function listEnabledPairsForUser(
  db: AppDb,
  userId: number,
): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.enabled, true),
        eq(chatPairs.configuredByUserId, userId),
      ),
    )
    .orderBy(asc(chatPairs.id));
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

/** Enabled pairs for a target, newest id first (preferred when several remain). */
export async function listEnabledPairsByTarget(
  db: AppDb,
  targetChatId: number,
): Promise<ChatPair[]> {
  const rows = await db
    .select()
    .from(chatPairs)
    .where(
      and(
        eq(chatPairs.enabled, true),
        eq(chatPairs.targetChatId, targetChatId),
      ),
    )
    .orderBy(desc(chatPairs.id));
  return rows.map(mapRow);
}

export async function findEnabledPairByTarget(
  db: AppDb,
  targetChatId: number,
): Promise<ChatPair | undefined> {
  const rows = await listEnabledPairsByTarget(db, targetChatId);
  return rows[0];
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

/**
 * Delete pairs for this chat that the caller configured.
 * Rows owned by someone else are left in place and counted as blocked.
 */
export async function deletePairsForChat(
  db: AppDb,
  chatId: number,
  userId: number,
): Promise<DeletePairsForChatResult> {
  const involving = await db
    .select({ id: chatPairs.id, configuredByUserId: chatPairs.configuredByUserId })
    .from(chatPairs)
    .where(
      or(
        eq(chatPairs.sourceChatId, chatId),
        eq(chatPairs.targetChatId, chatId),
      ),
    );
  const blocked = involving.filter(
    (row) => row.configuredByUserId !== userId,
  ).length;
  if (involving.length === blocked) {
    return { deleted: 0, blocked };
  }
  const result = await db
    .delete(chatPairs)
    .where(
      and(
        or(
          eq(chatPairs.sourceChatId, chatId),
          eq(chatPairs.targetChatId, chatId),
        ),
        eq(chatPairs.configuredByUserId, userId),
      ),
    )
    .returning();
  return { deleted: result.length, blocked };
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
