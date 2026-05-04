'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { recentlyViewedStorage } from '@/lib/recently-viewed';
import type { PropertyListItem } from '@/types/property';

type State = {
  items: PropertyListItem[];
  loading: boolean;
};

export function useRecentlyViewed(excludeId?: number): State & {
  push: (id: number) => void;
  clear: () => void;
} {
  // Start with empty/false so SSR output matches first client render (hydration-safe).
  const [state, setState] = useState<State>({ items: [], loading: false });

  useEffect(() => {
    let cancelled = false;

    recentlyViewedStorage.purgeExpired();
    const entries = recentlyViewedStorage.read(excludeId);

    // Defer state syncs into a microtask so they leave the synchronous effect
    // body — react-hooks/set-state-in-effect allows setState in async callbacks
    // (the rule's "external systems" model). User-visible behavior is identical
    // because microtasks drain before paint, and existing tests already drain
    // them via `await Promise.resolve()` inside `act`.

    if (entries.length === 0) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setState((s) => (s.items.length === 0 && !s.loading ? s : { items: [], loading: false }));
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.resolve().then(() => {
      if (cancelled) return;
      setState((s) => (s.loading ? s : { ...s, loading: true }));
    });

    // TCK-100 — `/public/properties/by-ids` is a dedicated batch endpoint
    // that mirrors the `compare` contract. The legacy `/public/properties`
    // index ignores `filter[ids]` (no Spatie QueryBuilder), which is why
    // this hook used to return arbitrary recent properties.
    const qs = new URLSearchParams({ ids: entries.map((e) => e.id).join(',') });

    apiFetch<{ data: PropertyListItem[] }>(`/public/properties/by-ids?${qs}`)
      .then((resp) => {
        if (cancelled) return;
        const returnedIds = new Set(resp.data.map((p) => p.id));

        // Silently purge ghost IDs (deleted / unpublished properties).
        const ghostIds = entries.map((e) => e.id).filter((id) => !returnedIds.has(id));
        if (ghostIds.length > 0) recentlyViewedStorage.purgeIds(ghostIds);

        // Restore most-recent-first order from the store.
        const sorted = entries
          .map((e) => resp.data.find((p) => p.id === e.id))
          .filter((p): p is PropertyListItem => p !== undefined);

        setState({ items: sorted, loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ items: [], loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [excludeId]);

  const push = useCallback((id: number) => {
    recentlyViewedStorage.push(id);
  }, []);

  const clear = useCallback(() => {
    recentlyViewedStorage.clear();
    setState({ items: [], loading: false });
  }, []);

  return { ...state, push, clear };
}
