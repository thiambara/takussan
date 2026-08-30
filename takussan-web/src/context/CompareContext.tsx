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
  type ComparePreview,
  type ComparePreviews,
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
  /**
   * Le titre / la vignette de chaque bien sélectionné, quand l'appelant les a fournis au
   * moment du clic. Toujours consultable, jamais garanti : un état écrit avant l'aperçu,
   * ou une sélection venue d'une URL partagée, n'en porte aucun.
   */
  previews: ComparePreviews;
  isHydrated: boolean;
  isFull: boolean;
  has: (id: number) => boolean;
  add: (id: number, preview?: ComparePreview) => AddResult;
  remove: (id: number) => void;
  toggle: (id: number, preview?: ComparePreview) => AddResult;
  /** Replace the selection entirely — used by the /compare page cold-share. */
  replace: (ids: readonly number[]) => void;
  clear: () => void;
};

// ─── Module-level external store ─────────────────────────────────────────────

const listeners = new Set<() => void>();
let cachedSnapshot: CompareSnapshot = { ids: [], previews: {} };
let cachedSnapshotKey = '';

type CompareSnapshot = { ids: number[]; previews: ComparePreviews };

/**
 * Build a stable identity for each distinct (ids, previews) pair. Two reads
 * that yield the same content must return the *same* reference, otherwise
 * `useSyncExternalStore` will tear.
 *
 * La signature couvre les aperçus et pas seulement les ids : sans ça, ajouter la vignette
 * d'un bien déjà sélectionné ne re-rendrait rien — la barre garderait son initiale grise
 * alors que la photo est en stockage.
 */
function selectSnapshot(): CompareSnapshot {
  const { ids, previews } = readCompare();
  const key = `${ids.join(',')}|${ids.map((id) => previews[id]?.photo ?? previews[id]?.title ?? '').join('\u0001')}`;
  if (key !== cachedSnapshotKey) {
    cachedSnapshot = { ids, previews };
    cachedSnapshotKey = key;
  }
  return cachedSnapshot;
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

function persist(next: number[], previews: ComparePreviews): void {
  writeCompare(next, Date.now(), previews);
  // Invalidate the cached snapshot so the next read picks up the new ids.
  cachedSnapshotKey = '__invalid__';
  notify();
}

function getServerSnapshot(): CompareSnapshot {
  return EMPTY_SNAPSHOT;
}

const EMPTY_SNAPSHOT: CompareSnapshot = { ids: [], previews: {} };

// ─── React surface ───────────────────────────────────────────────────────────

const CompareContext = createContext<CompareContextValue | null>(null);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const { ids, previews } = useSyncExternalStore(subscribe, selectSnapshot, getServerSnapshot);

  // Hydration flag — flips once the client store has run at least once.
  // We derive it from the subscription side-effect via a separate external
  // store so it also stays free of `set-state-in-effect`.
  const isHydrated = useSyncExternalStore(
    subscribeHydration,
    getHydrationClient,
    getHydrationServer,
  );

  const has = useCallback((id: number) => ids.includes(id), [ids]);

  const withPreview = useCallback(
    (id: number, preview?: ComparePreview): ComparePreviews =>
      preview ? { ...previews, [id]: preview } : previews,
    [previews],
  );

  const add = useCallback(
    (id: number, preview?: ComparePreview): AddResult => {
      if (ids.includes(id)) {
        // L'aperçu peut arriver APRÈS l'ajout — la carte n'en donnait pas, la fiche si.
        // On le complète sans changer la sélection, et le retour reste `noop`.
        if (preview && !previews[id]) persist(ids, withPreview(id, preview));
        return { status: 'noop', reason: 'already-selected' };
      }
      if (ids.length >= COMPARE_MAX_IDS) return { status: 'rejected', reason: 'full' };
      persist([...ids, id], withPreview(id, preview));
      return { status: 'added' };
    },
    [ids, previews, withPreview],
  );

  const remove = useCallback(
    (id: number) => {
      if (!ids.includes(id)) return;
      persist(ids.filter((v) => v !== id), previews);
    },
    [ids, previews],
  );

  const toggle = useCallback(
    (id: number, preview?: ComparePreview): AddResult => {
      if (ids.includes(id)) {
        persist(ids.filter((v) => v !== id), previews);
        return { status: 'removed' };
      }
      if (ids.length >= COMPARE_MAX_IDS) return { status: 'rejected', reason: 'full' };
      persist([...ids, id], withPreview(id, preview));
      return { status: 'added' };
    },
    [ids, previews, withPreview],
  );

  const replace = useCallback(
    (next: readonly number[]) => {
      // Une sélection venue d'une URL partagée ne porte aucun aperçu ; ceux des ids qui
      // survivent au remplacement sont conservés, `writeCompare` élague le reste.
      persist([...next], previews);
    },
    [previews],
  );

  const clear = useCallback(() => persist([], {}), []);

  const value = useMemo<CompareContextValue>(
    () => ({
      ids,
      previews,
      isHydrated,
      isFull: ids.length >= COMPARE_MAX_IDS,
      has,
      add,
      remove,
      toggle,
      replace,
      clear,
    }),
    [ids, previews, isHydrated, has, add, remove, toggle, replace, clear],
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
  previews: {},
  isHydrated: false,
  isFull: false,
  has: () => false,
  add: () => ({ status: 'noop', reason: 'already-selected' }),
  remove: () => undefined,
  toggle: () => ({ status: 'noop', reason: 'already-selected' }),
  replace: () => undefined,
  clear: () => undefined,
};
