export const RECENTLY_VIEWED_KEY = 'takussan.recently-viewed';
export const RECENTLY_VIEWED_MAX = 12;
export const RECENTLY_VIEWED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RecentlyViewedEntry = {
  id: number;
  viewed_at: string; // ISO timestamp
};

export type RecentlyViewedStore = RecentlyViewedEntry[];

function readRaw(): RecentlyViewedStore {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentlyViewedEntry =>
        e !== null &&
        typeof e === 'object' &&
        typeof e.id === 'number' &&
        typeof e.viewed_at === 'string',
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: RecentlyViewedStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — silently ignore */
  }
}

export const recentlyViewedStorage = {
  push(id: number): void {
    const now = new Date().toISOString();
    const entries = readRaw().filter((e) => e.id !== id);
    entries.unshift({ id, viewed_at: now });
    writeRaw(entries.slice(0, RECENTLY_VIEWED_MAX));
  },

  read(excludeId?: number): RecentlyViewedStore {
    const entries = readRaw();
    return excludeId !== undefined ? entries.filter((e) => e.id !== excludeId) : entries;
  },

  purgeExpired(now: number = Date.now()): void {
    const cutoff = now - RECENTLY_VIEWED_TTL_MS;
    writeRaw(readRaw().filter((e) => new Date(e.viewed_at).getTime() > cutoff));
  },

  purgeIds(ids: number[]): void {
    const set = new Set(ids);
    writeRaw(readRaw().filter((e) => !set.has(e.id)));
  },

  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(RECENTLY_VIEWED_KEY);
    } catch {
      /* ignore */
    }
  },
};
