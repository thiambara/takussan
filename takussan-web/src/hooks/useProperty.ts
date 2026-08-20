'use client';
import { useReducer, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('property.detail');
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'LOADING' });
    apiFetch<{ data: PropertyDetail }>(`/public/properties/${slug}`)
      .then(res => { if (!cancelled) dispatch({ type: 'SUCCESS', data: res.data }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        // ⚠️ SEUL usage légitime d'`err.message` du dépôt : il est INSPECTÉ, jamais affiché.
        // `apiFetch` lève `Error('API error 404: /public/properties/x')` — une chaîne technique
        // qui sert ici à distinguer un 404 d'une autre panne. Le libellé rendu, lui, sort du
        // dictionnaire (`t('notFound')`) deux lignes plus bas.
        const msg = err instanceof Error ? err.message : '';
        const notFound = /\b404\b/.test(msg);
        dispatch({ type: 'ERROR', message: notFound ? 'NOT_FOUND' : t('notFound') });
      });
    return () => { cancelled = true; };
  }, [slug, t]);

  return {
    data:    state.status === 'success' ? state.data : null,
    loading: state.status === 'loading',
    error:   state.status === 'error' ? state.message : null,
  };
}
