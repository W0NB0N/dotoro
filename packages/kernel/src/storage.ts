/**
 * Synchronous key/value store holding JSON-serialisable values.
 * The host loads persisted data before the kernel starts and flushes writes in the background.
 */
export interface KeyValueStore {
  get<T = unknown>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  keys(): string[];
}

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  constructor(initial?: Record<string, unknown>) {
    if (initial) for (const [k, v] of Object.entries(initial)) this.set(k, v);
  }

  get<T = unknown>(key: string): T | undefined {
    const raw = this.map.get(key);
    return raw === undefined ? undefined : (JSON.parse(raw) as T);
  }

  set(key: string, value: unknown): void {
    if (value === undefined) {
      this.map.delete(key);
      return;
    }
    // Serialising on write guarantees values are plain JSON and detached from app state.
    this.map.set(key, JSON.stringify(value));
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  keys(): string[] {
    return [...this.map.keys()];
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of this.map) out[k] = JSON.parse(v);
    return out;
  }
}

/** A view of a store where every key is prefixed, so apps can't collide. */
export function scopedStore(store: KeyValueStore, prefix: string): KeyValueStore {
  const p = `${prefix}:`;
  return {
    get: <T>(key: string) => store.get<T>(p + key),
    set: (key, value) => store.set(p + key, value),
    delete: (key) => store.delete(p + key),
    keys: () => store.keys().filter((k) => k.startsWith(p)).map((k) => k.slice(p.length)),
  };
}
