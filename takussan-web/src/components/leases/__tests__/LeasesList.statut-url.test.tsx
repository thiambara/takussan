/**
 * TCK-1513 (P167.03) — `LeasesList` lit `?status=` à l'ouverture pour initialiser son sélecteur de
 * statut, comme `BookingsList` depuis TCK-1293 : le lien « Baux à signer » de l'aperçu de l'agent
 * ouvre ainsi la liste sur `pending_signature`. Une valeur hors de `STATUS_ORDER` est ignorée.
 *
 * Le hook `useLeases` est le vrai : la garde porte sur ce qui part à l'API, `filter[status]`.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildQueryString } from '@/lib/api';
import type { SpatieQueryParams } from '@/types/api';
import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { LeasesList } from '../LeasesList';

const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const appels = vi.hoisted(() => [] as { path: string; params?: unknown }[]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_key: unknown, path: string, opts?: { params?: unknown }) => {
    appels.push({ path, params: opts?.params });
    return { data: { data: [] }, isLoading: false, isError: false, refetch: vi.fn() };
  },
  useApiMutation: vi.fn(),
}));
vi.mock('@/lib/queries/leases', async () => {
  const reel = await vi.importActual<typeof import('@/lib/queries/leases')>('@/lib/queries/leases');
  return { ...reel, useLeasePropertyOptions: () => ({ data: { data: [] } }) };
});

function requetesDesBaux(): string[] {
  return appels
    .filter((a) => a.path === '/api/leases')
    .map((a) => decodeURIComponent(buildQueryString(a.params as SpatieQueryParams)));
}

describe('LeasesList — statut porté par l’URL (TCK-1513)', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it('ouvre sur le statut que nomme `?status=` et le filtre à l’API', () => {
    nav.query = 'status=pending_signature';
    render(withIntl(<LeasesList />));

    expect(requetesDesBaux().at(-1)).toContain('filter[status]=pending_signature');
    expect(screen.getByRole('combobox', { name: fr.lease.list.filterByStatus })).toHaveTextContent(
      fr.lease.status.pending_signature,
    );
  });

  it('ignore une valeur hors des statuts et ouvre sur « Tous »', () => {
    nav.query = 'status=n_importe_quoi';
    render(withIntl(<LeasesList />));

    expect(requetesDesBaux().at(-1)).not.toContain('filter[status]');
    expect(screen.getByRole('combobox', { name: fr.lease.list.filterByStatus })).toHaveTextContent(
      fr.lease.list.allStatuses,
    );
  });
});
