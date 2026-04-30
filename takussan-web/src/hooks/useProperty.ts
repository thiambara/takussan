'use client';
import { useReducer, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';

type State =
  | { status: 'loading' }
  | { status: 'success'; data: PropertyDetail }
  | { status: 'error'; message: string };

type Action =
  | { type: 'LOADING' }
  | { type: 'SUCCESS'; data: PropertyDetail }
  | { type: 'ERROR'; message: string };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':  return { status: 'loading' };
    case 'SUCCESS':  return { status: 'success', data: action.data };
    case 'ERROR':    return { status: 'error', message: action.message };
  }
}

export function useProperty(slug: string) {
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'LOADING' });
    apiFetch<{ data: PropertyDetail }>(`/public/properties/${slug}`)
      .then(res => { if (!cancelled) dispatch({ type: 'SUCCESS', data: res.data }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        const notFound = /\b404\b/.test(msg);
        dispatch({ type: 'ERROR', message: notFound ? 'NOT_FOUND' : 'Bien introuvable.' });
      });
    return () => { cancelled = true; };
  }, [slug]);

  return {
    data:    state.status === 'success' ? state.data : null,
    loading: state.status === 'loading',
    error:   state.status === 'error' ? state.message : null,
  };
}
