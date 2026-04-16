'use client';
import { useReducer, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { SearchFilters, SearchResult } from '@/types/search';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: SearchResult }
  | { status: 'error' };

type Action =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; result: SearchResult }
  | { type: 'ERROR' };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':  return { status: 'loading' };
    case 'SUCCESS':  return { status: 'success', result: action.result };
    case 'ERROR':    return { status: 'error' };
  }
}

function buildQueryString(filters: SearchFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function filtersFromSearchParams(searchParams: URLSearchParams): SearchFilters {
  return {
    location:  searchParams.get('location')  ?? undefined,
    price_min: searchParams.get('price_min') ? Number(searchParams.get('price_min')) : undefined,
    price_max: searchParams.get('price_max') ? Number(searchParams.get('price_max')) : undefined,
    bedrooms:  searchParams.get('bedrooms')  ? Number(searchParams.get('bedrooms'))  : undefined,
    sort:      searchParams.get('sort')      ?? undefined,
    page:      searchParams.get('page')      ? Number(searchParams.get('page'))      : undefined,
  };
}

export function useSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  const currentFilters = filtersFromSearchParams(searchParams);

  const search = useCallback((filters: SearchFilters) => {
    const qs = buildQueryString(filters);
    router.push(`${pathname}${qs ? '?' + qs : ''}`);
    dispatch({ type: 'LOADING' });
    let cancelled = false;
    apiFetch<SearchResult>(`/public/properties/search${qs ? '?' + qs : ''}`)
      .then(result => { if (!cancelled) dispatch({ type: 'SUCCESS', result }); })
      .catch(() => { if (!cancelled) dispatch({ type: 'ERROR' }); });
    return () => { cancelled = true; };
  }, [router, pathname]);

  // Charger au montage avec les filtres URL actuels
  useEffect(() => {
    const qs = buildQueryString(currentFilters);
    dispatch({ type: 'LOADING' });
    let cancelled = false;
    apiFetch<SearchResult>(`/public/properties/search${qs ? '?' + qs : ''}`)
      .then(result => { if (!cancelled) dispatch({ type: 'SUCCESS', result }); })
      .catch(() => { if (!cancelled) dispatch({ type: 'ERROR' }); });
    return () => { cancelled = true; };
    // On ne met pas currentFilters dans les deps pour éviter les boucles infinies
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  return {
    data:    state.status === 'success' ? state.result : null,
    loading: state.status === 'loading' || state.status === 'idle',
    error:   state.status === 'error',
    filters: currentFilters,
    search,
  };
}
