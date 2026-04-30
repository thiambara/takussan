'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { PropertyListItem } from '@/types/property';

type State = {
  data: PropertyListItem[];
  loading: boolean;
  error: string | null;
};

export function useSimilarProperties(slug: string) {
  const [state, setState] = useState<State>({ data: [], loading: true, error: null });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    apiFetch<{ data: PropertyListItem[] }>(`/public/properties/${slug}/similar`)
      .then((res) => {
        if (!cancelled) setState({ data: res.data, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled)
          setState({ data: [], loading: false, error: 'Impossible de charger les biens similaires.' });
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return state;
}
