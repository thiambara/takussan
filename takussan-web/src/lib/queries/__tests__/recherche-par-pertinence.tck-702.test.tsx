import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

/**
 * TCK-702 (piste P16.02) — une recherche posée sur une liste interne adossée à Meilisearch doit
 * laisser l'API la classer par pertinence (TCK-281, `defaultSortsWithRelevance()`). Or
 * `defaultSorts()` s'efface devant tout `sort=` explicite : le front n'envoie donc pas de tri par
 * défaut quand `filter[search]` est posé. Un tri choisi par l'appelant, lui, part toujours.
 */

const apiQueryCalls: unknown[][] = [];

vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    apiQueryCalls.push(args);
    return { data: undefined, isLoading: true, isError: false, error: null };
  },
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

function mockFetch() {
  const spy = vi.fn(async (..._args: Parameters<typeof fetch>): Promise<unknown> => ({
    ok: true,
    status: 200,
    json: async () => ({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } }),
    text: async () => '{}',
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Clients — fetchDashboardCustomers', () => {
  async function sortEnvoye(params: Parameters<typeof import('../customers').fetchDashboardCustomers>[1]) {
    const { fetchDashboardCustomers } = await import('../customers');
    const spy = mockFetch();
    await fetchDashboardCustomers('tok', params);
    return new URL(String(spy.mock.calls[0][0]), 'http://x').searchParams.get('sort');
  }

  it('sans tri imposé quand une recherche est posée : la pertinence de l\'API s\'applique', async () => {
    expect(await sortEnvoye({ filters: { search: 'diop' } })).toBeNull();
  });

  it('garde -created_at sans recherche', async () => {
    expect(await sortEnvoye({})).toBe('-created_at');
  });

  it('un tri choisi par l\'appelant part, recherche comprise', async () => {
    expect(await sortEnvoye({ sort: 'last_name', filters: { search: 'diop' } })).toBe('last_name');
  });
});

describe('Interventions — useMaintenanceRequests et useMaintenanceHistoryForProperty', () => {
  beforeEach(() => {
    apiQueryCalls.length = 0;
  });

  function sortDu(dernierAppel: unknown[] | undefined): unknown {
    return (dernierAppel?.[2] as { params: { sort?: string } }).params.sort;
  }

  it('sans tri imposé quand une recherche est posée', async () => {
    const { useMaintenanceRequests, useMaintenanceHistoryForProperty } = await import('../maintenance');
    renderHook(() => useMaintenanceRequests({ search: 'fuite' }));
    expect(sortDu(apiQueryCalls.at(-1))).toBeUndefined();
    renderHook(() => useMaintenanceHistoryForProperty(44, { search: 'fuite' }));
    expect(sortDu(apiQueryCalls.at(-1))).toBeUndefined();
  });

  it('garde -created_at sans recherche', async () => {
    const { useMaintenanceRequests } = await import('../maintenance');
    renderHook(() => useMaintenanceRequests({}));
    expect(sortDu(apiQueryCalls.at(-1))).toBe('-created_at');
  });

  it('un tri choisi par l\'appelant part, recherche comprise', async () => {
    const { useMaintenanceRequests } = await import('../maintenance');
    renderHook(() => useMaintenanceRequests({ search: 'fuite', sort: 'scheduled_at' }));
    expect(sortDu(apiQueryCalls.at(-1))).toBe('scheduled_at');
  });
});
