import { afterEach, describe, expect, it, vi } from "vitest";

import { ForwardBatcher } from "../../src/bot/relocate/batcher.js";

type TimerFn = () => void;

/**
 * Record `setTimeout` callbacks instead of using fake timers.
 * `vi.useFakeTimers()` redefines `Temporal.Now`, which current Node rejects.
 */
function installTimerSpy() {
  const pending = new Map<number, TimerFn>();
  let nextId = 1;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    const id = nextId++;
    pending.set(id, () => {
      pending.delete(id);
      if (typeof fn === "function") fn();
    });
    return id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout);
  vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id?: NodeJS.Timeout) => {
    if (typeof id === "number") pending.delete(id);
  }) as typeof clearTimeout);
  return {
    get size() {
      return pending.size;
    },
    async fireNext() {
      const next = pending.values().next().value;
      if (!next) throw new Error("no pending timer");
      next();
      await Promise.resolve();
    },
  };
}

describe("ForwardBatcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flushes each key as its own batch", async () => {
    const batches: number[][] = [];
    const batcher = new ForwardBatcher<number>({
      windowMs: 60_000,
      onBatch: async (items) => {
        batches.push(items);
      },
    });
    batcher.push("a", 1);
    batcher.push("a", 2);
    batcher.push("b", 3);
    await batcher.flushAll();
    expect(batches).toEqual([
      [1, 2],
      [3],
    ]);
    batcher.stop();
  });

  it("waits out a quiet period and resets it when another item arrives", async () => {
    const timers = installTimerSpy();
    const batches: number[][] = [];
    const batcher = new ForwardBatcher<number>({
      windowMs: 2_000,
      onBatch: async (items) => {
        batches.push(items);
      },
    });
    batcher.push("a", 1);
    expect(timers.size).toBe(1);
    batcher.push("a", 2);
    expect(timers.size).toBe(1);
    expect(batches).toEqual([]);
    await timers.fireNext();
    expect(batches).toEqual([[1, 2]]);
    batcher.stop();
  });

  it("stop drops a pending batch", async () => {
    const timers = installTimerSpy();
    const batches: number[][] = [];
    const batcher = new ForwardBatcher<number>({
      windowMs: 2_000,
      onBatch: async (items) => {
        batches.push(items);
      },
    });
    batcher.push("a", 1);
    expect(timers.size).toBe(1);
    batcher.stop();
    expect(timers.size).toBe(0);
    expect(batches).toEqual([]);
  });
});
