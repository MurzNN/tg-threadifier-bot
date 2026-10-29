import { afterEach, describe, expect, it, vi } from "vitest";

import { ForwardBatcher } from "../../src/bot/relocate/batcher.js";

/** Avoid faking `performance.now`, which Node rejects as non-configurable. */
const fakeTimers = () =>
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });

describe("ForwardBatcher", () => {
  afterEach(() => {
    vi.useRealTimers();
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
    fakeTimers();
    const batches: number[][] = [];
    const batcher = new ForwardBatcher<number>({
      windowMs: 2_000,
      onBatch: async (items) => {
        batches.push(items);
      },
    });
    batcher.push("a", 1);
    await vi.advanceTimersByTimeAsync(1_500);
    batcher.push("a", 2);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(batches).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(batches).toEqual([[1, 2]]);
    batcher.stop();
  });

  it("stop drops a pending batch", async () => {
    fakeTimers();
    const batches: number[][] = [];
    const batcher = new ForwardBatcher<number>({
      windowMs: 2_000,
      onBatch: async (items) => {
        batches.push(items);
      },
    });
    batcher.push("a", 1);
    batcher.stop();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(batches).toEqual([]);
  });
});
