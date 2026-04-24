'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react';

import {
  COMPARE_MAX_IDS,
  COMPARE_STORAGE_KEY,
  readCompare,
  writeCompare,
} from '@/lib/compare';

/**
 * TCK-082 — shared selection store for the property comparator.
 *
 * `localStorage` is the persistence layer (24h TTL). A module-level store
 * bridges storage events into React via `useSyncExternalStore`, which is
 * the React-19-blessed pattern for syncing with an external data source
 * and keeps us out of the `set-state-in-effect` footgun.
 */

export type AddResult =
  | { status: 'added' }
  | { status: 'removed' }
  | { status: 'noop'; reason: 'already-selected' }
  | { status: 'rejected'; reason: 'full' };

type CompareContextValue = {
  ids: number[];
  isHydrated: boolean;
  isFull: boolean;
  has: (id: number) => boolean;
  add: (id: number) => AddResult;
  remove: (id: number) => void;
  toggle: (id: number) => AddResult;
  /** Replace the selection entirely — used by the /compare page cold-share. */
  replace: (ids: readonly number[]) => void;
  clear: () => void;
};

// ─── Module-level external store ─────────────────────────────────────────────

const listeners = new Set<() => void>();
let cachedIds: number[] = [];
let cachedIdsKey = '';

/**
 * Build a stable array identity for each distinct id-sequence. Two reads
 * that yield the same sequence must return the *same* reference, otherwise
 * `useSyncExternalStore` will tear.
 */
function selectIds(): number[] {
  const next = readCompare().ids;
  const key = next.join(',');
  if (key !== cachedIdsKey) {
    cachedIds = next;
    cachedIdsKey = key;
  }
  return cachedIds;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key && event.key !== COMPARE_STORAGE_KEY) return;
    listener();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

function notify(): void {
  for (const l of listeners) l();
}

function persist(next: number[]): void {
  writeCompare(next);
  // Invalidate the cached snapshot so the next read picks up the new ids.
  cachedIdsKey = '__invalid__';
  notify();
}

function getServerSnapshot(): number[] {
  return EMPTY_IDS;
}

const EMPTY_IDS: number[] = [];

// ─── React surface ───────────────────────────────────────────────────────────

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const ids = useSyncExternalStore(subscribe, selectIds, getServerSnapshot);

  // Hydration flag — flips once the client store has run at least once.
  // We derive it from the subscription side-effect via a separate external
  // store so it also stays free of `set-state-in-effect`.
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getHydrationClient,
    getHydrationServer,
  );

  const has = useCallback((id: number) => ids.includes(id), [ids]);

  const add = useCallback(
    (id: number): AddResult => {
      if (ids.includes(id)) return { status: 'noop', reason: 'already-selected' };
      if (ids.length >= COMPARE_MAX_IDS) return { status: 'rejected', reason: 'full' };
      persist([...ids, id]);
      return { status: 'added' };
    },
    [ids],
  );

  const remove = useCallback(
    (id: number) => {
      if (!ids.includes(id)) return;
      persist(ids.filter((v) => v !== id));
    },
    [ids],
  );

  const toggle = useCallback(
    (id: number): AddResult => {
      if (ids.includes(id)) {
        persist(ids.filter((v) => v !== id));
        return { status: 'removed' };
      }
      if (ids.length >= COMPARE_MAX_IDS) return { status: 'rejected', reason: 'full' };
      persist([...ids, id]);
      return { status: 'added' };
    },
    [ids],
  );

  const replace = useCallback((next: readonly number[]) => {
    persist([...next]);
  }, []);

  const clear = useCallback(() => persist([]), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      isHydrated,
      isFull: ids.length >= COMPARE_MAX_IDS,
      has,
      add,
      remove,
      toggle,
      replace,
      clear,
    }),
    [ids, isHydrated, has, add, remove, toggle, replace, clear],
  );

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

// ── Hydration flag store ────────────────────────────────────────────────────
// The client snapshot is constant `true`; the server snapshot is `false`.
// `useSyncExternalStore` resolves the mismatch by treating the client
// snapshot as authoritative after mount — that gives us a clean boolean
// without any effect.

function subscribeHydration(): () => void {
  // Hydration never changes at runtime — no need to notify. The listener
  // parameter is ignored on purpose: `useSyncExternalStore` is happy with
  // any cleanup function.
  return () => undefined;
}

function getHydrationClient(): boolean {
  return true;
}

function getHydrationServer(): boolean {
  return false;
}

/**
 * Consumer hook for the comparator selection. Works with or without a
 * provider — falls back to a no-op (empty) state so components nested
 * outside the public layout still render without crashing.
 */
export function useCompare(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (ctx) return ctx;
  return FALLBACK_VALUE;
}

const FALLBACK_VALUE: CompareContextValue = {
  ids: [],
  isHydrated: false,
  isFull: false,
  has: () => false,
  add: () => ({ status: 'noop', reason: 'already-selected' }),
  remove: () => undefined,
  toggle: () => ({ status: 'noop', reason: 'already-selected' }),
  replace: () => undefined,
  clear: () => undefined,
};
