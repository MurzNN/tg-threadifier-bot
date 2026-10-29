import type { PendingForward, ResolvedRelocation } from "./run.js";

export type DraftStep = "confirm" | "title" | "pick";

export type RelocationDraft = {
  id: string;
  targetChatId: number;
  moderatorUserId: number;
  step: DraftStep;
  promptMessageId: number | null;
  plan: ResolvedRelocation;
};

export function draftKey(targetChatId: number, moderatorUserId: number): string {
  return `${targetChatId}:${moderatorUserId}`;
}

/** In-memory relocate confirmation. One open draft per target chat and moderator. */
export class RelocationDraftStore {
  #byKey = new Map<string, RelocationDraft>();
  #byId = new Map<string, RelocationDraft>();
  #tails = new Map<string, Promise<void>>();
  #seq = 0;

  getByKey(targetChatId: number, moderatorUserId: number): RelocationDraft | undefined {
    return this.#byKey.get(draftKey(targetChatId, moderatorUserId));
  }

  getById(id: string): RelocationDraft | undefined {
    return this.#byId.get(id);
  }

  create(input: {
    targetChatId: number;
    moderatorUserId: number;
    plan: ResolvedRelocation;
  }): RelocationDraft {
    this.#seq += 1;
    const draft: RelocationDraft = {
      id: this.#seq.toString(36),
      targetChatId: input.targetChatId,
      moderatorUserId: input.moderatorUserId,
      step: "confirm",
      promptMessageId: null,
      plan: input.plan,
    };
    this.#byId.set(draft.id, draft);
    this.#byKey.set(draftKey(draft.targetChatId, draft.moderatorUserId), draft);
    return draft;
  }

  delete(draft: RelocationDraft): void {
    this.#byId.delete(draft.id);
    const key = draftKey(draft.targetChatId, draft.moderatorUserId);
    if (this.#byKey.get(key)?.id === draft.id) this.#byKey.delete(key);
  }

  /** Run draft updates and button presses for one moderator one at a time. */
  runExclusive<T>(targetChatId: number, moderatorUserId: number, fn: () => Promise<T>): Promise<T> {
    const key = draftKey(targetChatId, moderatorUserId);
    const prev = this.#tails.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.#tails.set(
      key,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  /** Rewrite an open confirmation when a group upgrades to a supergroup. */
  remapChatId(oldChatId: number, newChatId: number): number {
    let updated = 0;
    for (const draft of this.#byId.values()) {
      if (draft.targetChatId !== oldChatId) continue;
      this.#byKey.delete(draftKey(oldChatId, draft.moderatorUserId));
      draft.targetChatId = newChatId;
      if (draft.plan.pair.targetChatId === oldChatId) {
        draft.plan.pair = { ...draft.plan.pair, targetChatId: newChatId };
      }
      for (const item of draft.plan.items) {
        if (item.targetChatId === oldChatId) item.targetChatId = newChatId;
      }
      this.#byKey.set(draftKey(newChatId, draft.moderatorUserId), draft);
      updated += 1;
    }
    return updated;
  }
}

export function mergeForwards(
  current: PendingForward[],
  incoming: PendingForward[],
): PendingForward[] {
  const seen = new Set(current.map((item) => item.triggerMessageId));
  const extra = incoming.filter((item) => !seen.has(item.triggerMessageId));
  return extra.length === 0 ? current : [...current, ...extra];
}
