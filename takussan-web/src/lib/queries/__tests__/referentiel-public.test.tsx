import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import {
  useEquipementsApprouves,
  useQuartiersDuReferentiel,
  useVillesDuReferentiel,
} from '../referentiel-public';

/**
 * TCK-633 (lot E) — les listes que le panneau de filtres propose : villes et quartiers du
 * référentiel (ADR-0062, lot D), équipements approuvés du catalogue (`/api/public/amenities`,
 * lisible sans compte — addendum du plan maître). Ce test garde le CHEMIN : le préfixe `/api` que
 * `useApiQuery` n'ajoute pas (un oubli rend `net::ERR_FAILED` par CORS, pas un 404), et la route
 * publique des équipements plutôt que `/api/tags`, qui exige un compte.
 */

const urls: string[] = [];

function repondre(data: unknown[]) {
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(decodeURIComponent(String(input)));
      return { ok: true, status: 200, json: async () => ({ data }) };
    }),
  );
}

function enveloppe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Enveloppe({ children }: { children: React.ReactNode }) {
    return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-633 — hooks du référentiel public', () => {
  it('les villes viennent de /api/public/geo/cities, sans région', async () => {
    repondre([{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7, longitude: -17.45 }]);
    const { result } = renderHook(() => useVillesDuReferentiel(), { wrapper: enveloppe() });

    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Dakar'));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/public\/geo\/cities$/);
  });

  it('les quartiers attendent une ville, puis la passent en `city`', async () => {
    repondre([{ id: 10, city_id: 7, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' }]);
    const sansVille = renderHook(() => useQuartiersDuReferentiel(null), { wrapper: enveloppe() });
    await new Promise((r) => setTimeout(r, 20));
    expect(sansVille.result.current.fetchStatus).toBe('idle');
    expect(urls).toHaveLength(0);

    const { result } = renderHook(() => useQuartiersDuReferentiel(7), { wrapper: enveloppe() });
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Almadies'));
    expect(urls[0]).toMatch(/\/api\/public\/geo\/neighborhoods\?city=7$/);
  });

  it('les équipements sont ceux du catalogue APPROUVÉ, lus sans compte', async () => {
    repondre([{ id: 3, name: 'Piscine', slug: 'piscine' }]);
    const { result } = renderHook(() => useEquipementsApprouves(), { wrapper: enveloppe() });

    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Piscine'));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/public\/amenities$/);
    expect(urls[0]).not.toContain('/api/tags');
  });
});
