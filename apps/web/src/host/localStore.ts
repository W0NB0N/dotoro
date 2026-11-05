import { type KeyValueStore, MemoryStore } from '@dotoro/kernel';

const PREFIX = 'dotoro:';
const FLUSH_DELAY_MS = 300;

export interface PersistentStore extends KeyValueStore {
  /** Write pending changes to localStorage now. */
  flush(): void;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage: run in memory only
  }
}

/**
 * Kernel store backed by localStorage: everything is loaded up front so reads are synchronous,
 * and writes are batched. (Larger data — user art, imported music — will move to IndexedDB.)
 */
export function createLocalStore(): PersistentStore {
  const ls = storage();
  const mem = new MemoryStore();
  if (ls) {
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        mem.set(key.slice(PREFIX.length), JSON.parse(ls.getItem(key)!));
      } catch {
        // ignore corrupt entries
      }
    }
  }

  const dirty = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!ls) return;
    for (const key of dirty) {
      try {
        const value = mem.get(key);
        if (value === undefined) ls.removeItem(PREFIX + key);
        else ls.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) {
        console.warn('[store] could not persist', key, e);
      }
    }
    dirty.clear();
  };

  const touch = (key: string) => {
    dirty.add(key);
    timer ??= setTimeout(flush, FLUSH_DELAY_MS);
  };

  return {
    get: (key) => mem.get(key),
    set: (key, value) => {
      mem.set(key, value);
      touch(key);
    },
    delete: (key) => {
      mem.delete(key);
      touch(key);
    },
    keys: () => mem.keys(),
    flush,
  };
}
