/**
 * TCK-1727 (P167.01) — la liste des interventions lit `?status=` : un seul statut, ou plusieurs
 * séparés par des virgules (ce que portent « Devis à valider » et « Demandes d'intervention en
 * cours »), envoyés tels quels en `filter[status]`. Le sélecteur nomme la valeur composée par les
 * libellés de statut joints. Avant, le statut tenait dans un `useState('')` : le lien ouvrait toutes
 * les interventions, closes et annulées comprises.
 */
import { render, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { MaintenanceListParams } from '@/lib/queries/maintenance';

const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 12, roles: ['landlord'] } }) }));

const apiQueryCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (...args: unknown[]) => {
    apiQueryCalls.push(args);
    return { data: undefined, isLoading: true, isError: false, error: null };
  },
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const listParams = vi.hoisted(() => [] as (MaintenanceListParams | undefined)[]);
vi.mock('@/lib/queries/maintenance', async () => {
  const actual = await vi.importActual<typeof import('@/lib/queries/maintenance')>('@/lib/queries/maintenance');
  return {
    ...actual,
    useMaintenanceRequests: (params?: MaintenanceListParams) => {
      listParams.push(params);
      return { data: undefined, isLoading: true, isError: false, error: null };
    },
  };
});

import { MaintenanceList } from '../MaintenanceList';

describe('MaintenanceList — statuts portés par l’URL (TCK-1727)', () => {
  beforeEach(() => {
    listParams.length = 0;
    apiQueryCalls.length = 0;
  });

  it('`?status=quote_submitted,awaiting_owner` : les deux statuts demandés, et nommés', () => {
    nav.query = 'status=quote_submitted,awaiting_owner';
    render(withIntl(<MaintenanceList />));

    expect(listParams.at(-1)?.status).toEqual(['quote_submitted', 'awaiting_owner']);
    expect(screen.getByText('Devis soumis, En attente du bailleur')).toBeInTheDocument();
  });

  it('`?status=in_progress` : un seul statut', () => {
    nav.query = 'status=in_progress';
    render(withIntl(<MaintenanceList />));

    expect(listParams.at(-1)?.status).toEqual(['in_progress']);
  });

  it('un statut inconnu de l’URL est ignoré ; sans statut connu, tous', () => {
    nav.query = 'status=nimporte';
    render(withIntl(<MaintenanceList />));

    expect(listParams.at(-1)?.status ?? []).toEqual([]);
  });

  it('la requête envoie la liste en `filter[status]=a,b`', async () => {
    const { useMaintenanceRequests } = await vi.importActual<typeof import('@/lib/queries/maintenance')>(
      '@/lib/queries/maintenance',
    );
    renderHook(() => useMaintenanceRequests({ status: ['quote_submitted', 'awaiting_owner'] }));

    const options = apiQueryCalls.at(-1)?.[2] as { params: { filter: Record<string, string> } };
    expect(options.params.filter.status).toBe('quote_submitted,awaiting_owner');
  });
});
