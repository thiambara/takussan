'use client';
import { useReducer, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { PaginatedProperties } from '@/types/property';

type State =
  | { status: 'loading'; data: PaginatedProperties | null }
  | { status: 'success'; data: PaginatedProperties }
  | { status: 'error'; data: PaginatedProperties | null; message: string };

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: PaginatedProperties }
  | { type: 'FETCH_ERROR'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading', data: state.data };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.payload };
    case 'FETCH_ERROR':
      return { status: 'error', data: state.data, message: action.message };
  }
}

export type UsePropertiesParams = {
  page?: number;
  perPage?: number;
  featured?: boolean;
  sort?: 'latest' | 'price_asc' | 'price_desc' | 'relevance';
  transaction?: 'sale' | 'rent';
  type?: string;
  city?: string;
  query?: string;
};

export function useProperties(params: UsePropertiesParams = {}) {
  const { page = 1, perPage = 12, featured, sort, transaction, type, city, query } = params;

  const [state, dispatch] = useReducer(reducer, { status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    dispatch({ type: 'FETCH_START' });

    const qs = new URLSearchParams({ page: String(page), per_page: String(perPage) });
    if (featured !== undefined) qs.set('featured', String(featured));
    if (sort) qs.set('sort', sort);
    if (transaction) qs.set('transaction', transaction);
    if (type) qs.set('type', type);
    if (city) qs.set('city', city);
    if (query) qs.set('q', query);

    apiFetch<PaginatedProperties>(`/public/properties?${qs.toString()}`)
      .then(data => { if (!cancelled) dispatch({ type: 'FETCH_SUCCESS', payload: data }); })
      .catch(() => { if (!cancelled) dispatch({ type: 'FETCH_ERROR', message: 'Impossible de charger les annonces.' }); });

    return () => { cancelled = true; };
  }, [page, perPage, featured, sort, transaction, type, city, query]);

  return {
    data: state.data,
    properties: state.data?.data ?? [],
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
  };
}
