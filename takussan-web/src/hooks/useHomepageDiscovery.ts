'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { HomepageDiscoveryData, HomepageDiscoveryResponse } from '@/types/property';

/**
 * TCK-247 — the four homepage rows in one request.
 *
 * Replaces four `useProperties` calls plus a client-side dedup pass. Dropping
 * crossover ids client-side is not the same as refilling: a row that lost half
 * its cards to the row above simply rendered short. The server picks from a
 * wider candidate pool instead, so every row comes back full.
 *
 * `apiFetch` (not `apiRequest`) because this is a public endpoint — it prepends
 * `/api` itself, so the path here must NOT carry it. Same primitive as the
 * homepage's previous calls.
 *
 * The endpoint takes no sparse fieldsets: it is not built on
 * `spatie/laravel-query-builder`, and `HomepageDiscoveryRequest` accepts
 * exactly two params, `near_city` and `per_row`. Items already come back in the
 * light (list) shape of `PropertyResource`.
 */

/** One value for the four rows — the endpoint caps it at 20 (422 above). */
export const HOMEPAGE_DISCOVERY_PER_ROW = 12;

export interface UseHomepageDiscoveryParams {
  /**
   * The city guessed for the visitor. **Leave undefined when unknown** rather
   * than defaulting to Dakar here: the backend tells "unknown" and "a city we
   * have nothing for" apart, and only the second one retitles the row.
   */
  readonly nearCity?: string;
  readonly perRow?: number;
  /** Hold the request until the caller knows whether it has a city to send. */
  readonly enabled?: boolean;
}

export interface UseHomepageDiscoveryResult {
  readonly rows: HomepageDiscoveryData | null;
  readonly loading: boolean;
  /**
   * A flag, not a sentence: the label belongs to the front, through next-intl
   * (principe non négociable n°5).
   */
  readonly failed: boolean;
}

export function useHomepageDiscovery({
  nearCity,
  perRow = HOMEPAGE_DISCOVERY_PER_ROW,
  enabled = true,
}: UseHomepageDiscoveryParams = {}): UseHomepageDiscoveryResult {
  const [state, setState] = useState<UseHomepageDiscoveryResult>({
    rows: null,
    loading: true,
    failed: false,
  });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    // No `setState({ loading: true })` here, and that is deliberate twice over:
    // it would be a synchronous state update in an effect body (which
    // `react-hooks/set-state-in-effect` rejects), and on a refetch it would
    // blank rows that are already on screen — the flicker AC2 exists to
    // prevent. Stale rows stay up until the new payload lands.
    const qs = new URLSearchParams({ per_row: String(perRow) });
    if (nearCity) qs.set('near_city', nearCity);

    apiFetch<HomepageDiscoveryResponse>(`/public/properties/discovery?${qs.toString()}`)
      .then((res) => {
        if (!cancelled) setState({ rows: res.data, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ rows: null, loading: false, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [nearCity, perRow, enabled]);

  return state;
}
