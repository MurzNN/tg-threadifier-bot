/** Quiet period before forwards from one user are relocated together. */
export const BATCH_WINDOW_MS = 2_000;

/**
 * Groups items that share a key and arrive within `windowMs` of each other.
 * Each new item resets the timer. `flushAll` runs any open groups immediately.
 */
export class ForwardBatcher<T> {
  #buffers = new Map<string, T[]>();
  #timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly options: {
      windowMs: number;
      onBatch: (items: T[]) => Promise<void>;
    },
  ) {}

  push(key: string, item: T): void {
    const buf = this.#buffers.get(key) ?? [];
    buf.push(item);
    this.#buffers.set(key, buf);
    this.#arm(key);
  }

  async flushAll(): Promise<void> {
    const keys = new Set([...this.#buffers.keys(), ...this.#timers.keys()]);
    for (const key of keys) {
      await this.#flushKey(key);
    }
  }

  stop(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
    this.#buffers.clear();
  }

  #arm(key: string): void {
    const existing = this.#timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void this.#flushKey(key);
    }, this.options.windowMs);
    this.#timers.set(key, timer);
  }

  async #flushKey(key: string): Promise<void> {
    const existing = this.#timers.get(key);
    if (existing) clearTimeout(existing);
    this.#timers.delete(key);
    const items = this.#buffers.get(key);
    this.#buffers.delete(key);
    if (!items || items.length === 0) return;
    await this.options.onBatch(items);
  }
}
