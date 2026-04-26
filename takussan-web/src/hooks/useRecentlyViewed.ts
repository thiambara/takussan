'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, buildQueryString } from '@/lib/api';
import { recentlyViewedStorage } from '@/lib/recently-viewed';
import type { PropertyListItem } from '@/types/property';

const RECENTLY_VIEWED_FIELDS =
  'id,slug,title,price,currency,type,contract_type,rent_period,bedrooms,bathrooms,area,furnished,featured,main_photo_url,published_at,created_at';

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

  const fetchItems = useCallback(
    async (currentExcludeId?: number) => {
      recentlyViewedStorage.purgeExpired();
      const entries = recentlyViewedStorage.read(currentExcludeId);

      if (entries.length === 0) {
        setState({ items: [], loading: false });
        return;
      }

      setState((s) => ({ ...s, loading: true }));

      const ids = entries.map((e) => e.id).join(',');
      const qs = buildQueryString({
        filter: { ids },
        include: ['address', 'primaryMedia'],
        fields: { properties: RECENTLY_VIEWED_FIELDS },
      });

      try {
        const resp = await apiFetch<{ data: PropertyListItem[] }>(
          `/public/properties?${qs}`,
        );
        const returnedIds = new Set(resp.data.map((p) => p.id));

        // Silently purge ghost IDs (deleted / unpublished properties).
        const ghostIds = entries.map((e) => e.id).filter((id) => !returnedIds.has(id));
        if (ghostIds.length > 0) recentlyViewedStorage.purgeIds(ghostIds);

        // Restore most-recent-first order from the store.
        const idOrder = entries.map((e) => e.id);
        const sorted = idOrder
          .filter((id) => returnedIds.has(id))
          .map((id) => resp.data.find((p) => p.id === id)!);

        setState({ items: sorted, loading: false });
      } catch {
        setState({ items: [], loading: false });
      }
    },
    [],
  );

  useEffect(() => {
    fetchItems(excludeId);
  }, [excludeId, fetchItems]);

  const push = useCallback((id: number) => {
    recentlyViewedStorage.push(id);
  }, []);

  const clear = useCallback(() => {
    recentlyViewedStorage.clear();
    setState({ items: [], loading: false });
  }, []);

  return { ...state, push, clear };
}
