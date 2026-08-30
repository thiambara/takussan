'use client';

import { useEffect, useReducer } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, buildQueryString } from '@/lib/api';
import { idsToCsv } from '@/lib/compare';
import type { PropertyCompareResponse, PropertyDetail } from '@/types/property';

/**
 * TCK-082 — single fetch of the side-by-side compare payload.
 *
 * Applies spatie sparse fieldsets + include per CLAUDE.md. We explicitly
 * request only the relations (address, media, tags) and the fields needed
 * by the comparison grid.
 */

type State =
  | { status: 'idle'; data: null }
  | { status: 'loading'; data: PropertyDetail[] | null }
  | { status: 'success'; data: PropertyDetail[]; requestedIds: number[]; returnedIds: number[] }
  | { status: 'error'; data: null; message: string };

type Action =
  | { type: 'LOADING'; previous: PropertyDetail[] | null }
  | { type: 'SUCCESS'; payload: PropertyCompareResponse }
  | { type: 'ERROR'; message: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { status: 'loading', data: action.previous };
    case 'SUCCESS':
      return {
        status: 'success',
        data: action.payload.data,
        requestedIds: action.payload.meta.requested_ids,
        returnedIds: action.payload.meta.returned_ids,
      };
    case 'ERROR':
      return { status: 'error', data: null, message: action.message };
  }
}

/**
 * Les colonnes que le comparateur LIT.
 *
 * ⚠ TCK-491, mesuré le 2026-08-30 : `PublicPropertyController::compare()` construit un
 * `Property::query()` nu et **n'honore pas** `fields[properties]` — comme `show()`, `search()` et
 * `discovery()`. Cette liste ne réduit donc aucune charge utile ; elle dit l'intention de
 * l'appelant, et c'est elle qui restera vraie le jour où la route passera par `buildQuery()`.
 * `title_type` y figure depuis que le comparateur affiche le statut foncier.
 */
const COMPARE_FIELDS = [
  'id',
  'reference_number',
  'title',
  'slug',
  'price',
  'currency',
  'type',
  'contract_type',
  'rent_period',
  'title_type',
  'bedrooms',
  'bathrooms',
  'area',
  'furnished',
  'floor_number',
  'total_floors',
  'year_built',
  'parking_spaces',
  'featured',
  'published_at',
  'created_at',
] as const;

export function useCompare(ids: readonly number[]) {
  const t = useTranslations('compare');
  const [state, dispatch] = useReducer(reducer, { status: 'idle', data: null });

  useEffect(() => {
    if (ids.length < 2) {
      return;
    }

    let cancelled = false;
    dispatch({
      type: 'LOADING',
      previous: state.status === 'success' ? state.data : null,
    });

    // Spatie sparse fieldsets + includes per CLAUDE.md. The `ids` filter is
    // the contract from TCK-082 — the public `/properties/compare` endpoint
    // accepts a comma-separated list and silently drops unknown ids.
    const qs = buildQueryString({
      fields: {
        properties: COMPARE_FIELDS.join(','),
      },
      include: ['address', 'media', 'tags'],
      extra: { ids: idsToCsv(ids) },
    });

    apiFetch<PropertyCompareResponse>(`/public/properties/compare?${qs}`)
      .then((payload) => {
        if (cancelled) return;
        dispatch({ type: 'SUCCESS', payload });
      })
      .catch(() => {
        if (cancelled) return;
        dispatch({
          type: 'ERROR',
          message: t('loadError'),
        });
      });

    return () => {
      cancelled = true;
    };
    // We depend on the *serialized* list so identical arrays don't re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsToCsv(ids), t]);

  return {
    status: state.status,
    properties: state.status === 'success' ? state.data : state.status === 'loading' ? state.data : null,
    loading: state.status === 'loading',
    error: state.status === 'error' ? state.message : null,
    requestedIds: state.status === 'success' ? state.requestedIds : null,
    returnedIds: state.status === 'success' ? state.returnedIds : null,
  };
}
