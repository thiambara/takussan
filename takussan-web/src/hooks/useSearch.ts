'use client';
import { useReducer, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { SearchFilters, SearchResult } from '@/types/search';

type State =
  | { status: 'idle' }
  | { status: 'loading'; prev: SearchResult | null }
  | { status: 'success'; result: SearchResult }
  | { status: 'error'; prev: SearchResult | null };

type Action =
  | { type: 'LOADING'; prev: SearchResult | null }
  | { type: 'SUCCESS'; result: SearchResult }
  | { type: 'ERROR'; prev: SearchResult | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING': return { status: 'loading', prev: action.prev };
    case 'SUCCESS': return { status: 'success', result: action.result };
    case 'ERROR':   return { status: 'error', prev: action.prev };
  }
}

// ─── Serialisation ──────────────────────────────────────────────────────────

function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: Array<[string, string | number | boolean | undefined]> = [
    ['q',              filters.q],
    ['location',       filters.location],
    ['city',           filters.city],
    ['contract_type',  filters.contract_type],
    ['type',           filters.type],
    ['rent_period',    filters.rent_period],
    ['price_min',      filters.price_min],
    ['price_max',      filters.price_max],
    ['bedrooms',       filters.bedrooms],
    ['bathrooms',      filters.bathrooms],
    ['area_min',       filters.area_min],
    ['area_max',       filters.area_max],
    ['furnished',      filters.furnished],
    ['featured',       filters.featured],
    ['tags',           filters.tags],
    ['sort',           filters.sort],
    ['page',           filters.page],
    ['per_page',       filters.per_page],
  ];
  for (const [k, v] of entries) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  return params;
}

function filtersFromSearchParams(sp: URLSearchParams): SearchFilters {
  const n = (key: string) => { const v = sp.get(key); return v ? Number(v) : undefined; };
  const s = (key: string) => sp.get(key) ?? undefined;
  return {
    q:             s('q'),
    location:      s('location'),
    city:          s('city'),
    contract_type: s('contract_type') as SearchFilters['contract_type'],
    type:          s('type'),
    rent_period:   s('rent_period') as SearchFilters['rent_period'],
    price_min:     n('price_min'),
    price_max:     n('price_max'),
    bedrooms:      n('bedrooms'),
    bathrooms:     n('bathrooms'),
    area_min:      n('area_min'),
    area_max:      n('area_max'),
    furnished:     sp.has('furnished') ? (sp.get('furnished') === 'true') : undefined,
    featured:      sp.has('featured') ? (sp.get('featured') === 'true') : undefined,
    tags:          s('tags'),
    sort:          s('sort') as SearchFilters['sort'],
    page:          n('page'),
  };
}

// ─── Count active filters (excluding sort, page) ────────────────────────────

const IGNORED_KEYS: (keyof SearchFilters)[] = ['sort', 'page', 'per_page'];

export function countActiveFilters(filters: SearchFilters): number {
  return (Object.keys(filters) as (keyof SearchFilters)[])
    .filter(k => !IGNORED_KEYS.includes(k) && filters[k] !== undefined && filters[k] !== '')
    .length;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSearch() {
  const router   = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const prevResult = (): SearchResult | null => {
    // keep previous data while loading to avoid flicker
    return null;
  };

  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  const currentFilters = filtersFromSearchParams(searchParams);

  const search = useCallback((filters: Partial<SearchFilters>) => {
    const merged = { ...currentFilters, ...filters, page: 1 };
    const qs = filtersToParams(merged).toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, pathname, searchParams.toString()]);

  const setPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const resetFilters = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  const removeFilter = useCallback((key: keyof SearchFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(String(key));
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  // Fetch whenever URL params change
  useEffect(() => {
    const qs = searchParams.toString();
    const prev = state.status === 'success' ? state.result
               : state.status === 'loading' ? state.prev
               : state.status === 'error'   ? state.prev
               : null;

    dispatch({ type: 'LOADING', prev });

    let cancelled = false;
    apiFetch<SearchResult>(`/public/properties/search${qs ? '?' + qs : ''}`)
      .then(result  => { if (!cancelled) dispatch({ type: 'SUCCESS', result }); })
      .catch(()     => { if (!cancelled) dispatch({ type: 'ERROR', prev }); });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const result = state.status === 'success' ? state.result
               : (state.status === 'loading' || state.status === 'error') ? state.prev ?? null
               : null;

  return {
    data:           result,
    loading:        state.status === 'loading' || state.status === 'idle',
    error:          state.status === 'error',
    filters:        currentFilters,
    activeCount:    countActiveFilters(currentFilters),
    search,
    setPage,
    resetFilters,
    removeFilter,
  };
}
