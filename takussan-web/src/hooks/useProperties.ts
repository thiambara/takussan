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

export function useProperties(page = 1) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;

    dispatch({ type: 'FETCH_START' });

    apiFetch<PaginatedProperties>(`/public/properties?page=${page}`)
      .then(data => { if (!cancelled) dispatch({ type: 'FETCH_SUCCESS', payload: data }); })
      .catch(() => { if (!cancelled) dispatch({ type: 'FETCH_ERROR', message: 'Impossible de charger les annonces.' }); });

    return () => { cancelled = true; };
  }, [page]);

  return {
    data: state.data,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
  };
}
