'use client';

import { useSyncExternalStore } from 'react';

/**
 * Reactive favorites store backed by localStorage.
 *
 * Anonymous users get a persistent client-side wishlist via this store;
 * authenticated users hit `/api/favorites` directly (see `useFavorite`,
 * `FavoritesPopover`). On login the local IDs are POSTed to the API and
 * cleared (see AuthContext).
 *
 * Storage contract:
 *   Key:    `takussan.favorites`
 *   Value:  number[]  — JSON array of property IDs
 *   TTL:    none (persistent)
 *
 * Cross-tab sync: native `storage` event.
 * Same-tab sync: custom `takussan.favorites:change` event.
 */

export const FAVORITES_STORAGE_KEY = 'takussan.favorites';
const CHANGE_EVENT = 'takussan.favorites:change';

function parse(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
    );
  } catch {
    return [];
  }
}

function read(): number[] {
  if (typeof window === 'undefined') return [];
  return parse(window.localStorage.getItem(FAVORITES_STORAGE_KEY));
}

function write(ids: number[]): void {
  if (typeof window === 'undefined') return;
  const deduped = Array.from(new Set(ids));
  try {
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(deduped));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // quota / private mode — silently ignore
  }
}

export function getIds(): number[] {
  return read();
}

export function has(id: number): boolean {
  return read().includes(id);
}

export function add(id: number): void {
  const current = read();
  if (current.includes(id)) return;
  write([...current, id]);
}

export function remove(id: number): void {
  const current = read();
  if (!current.includes(id)) return;
  write(current.filter((v) => v !== id));
}

export function toggle(id: number): boolean {
  const current = read();
  const next = current.includes(id)
    ? current.filter((v) => v !== id)
    : [...current, id];
  write(next);
  return next.includes(id);
}

export function clear(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(FAVORITES_STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    // ignore
  }
}

/** Overwrite the entire id list — used to seed the store after login. */
export function replace(ids: number[]): void {
  write(ids);
}

export function subscribe(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_STORAGE_KEY || e.key === null) listener();
  };
  const onChange = () => listener();
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

// useSyncExternalStore needs a referentially-stable snapshot. We cache by
// signature so identical id-lists keep the same array identity.
let cachedSignature = '';
let cachedIds: number[] = [];

function getSnapshot(): number[] {
  const ids = read();
  const sig = ids.join(',');
  if (sig !== cachedSignature) {
    cachedSignature = sig;
    cachedIds = ids;
  }
  return cachedIds;
}

const EMPTY_IDS: number[] = [];

function getServerSnapshot(): number[] {
  return EMPTY_IDS;
}

export interface UseFavoritesResult {
  /** Property IDs currently favorited (cached client-side). */
  ids: number[];
  /** True after the first client render — gate UI to avoid SSR/CSR mismatches. */
  isHydrated: boolean;
  /** Number of favorites — convenience for badge rendering. */
  count: number;
  has: (id: number) => boolean;
  toggle: (id: number) => boolean;
  remove: (id: number) => void;
  add: (id: number) => void;
  clear: () => void;
  replace: (ids: number[]) => void;
}

// Hydration probe — the server snapshot is `false`, the client snapshot is
// `true`, so the value flips on the first client commit without needing a
// useEffect.
function subscribeNoop(): () => void {
  return () => {};
}

export function useFavorites(): UseFavoritesResult {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  return {
    ids,
    isHydrated,
    count: ids.length,
    has: (id) => ids.includes(id),
    toggle,
    remove,
    add,
    clear,
    replace,
  };
}
