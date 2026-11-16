/**
 * TCK-2919 — la fiche du bail (TCK-2912) mène à `/app/maintenance?filter[lease_id]=…` : la liste lit
 * ce paramètre et le transmet à l'API (`filter[lease_id]`, filtre exact autorisé par le modèle), au
 * lieu de s'ouvrir sur toutes les interventions. Un identifiant illisible est ignoré.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

const nav = vi.hoisted(() => ({ query: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 12, roles: ['agent'] } }) }));

const appels = vi.hoisted(() => [] as { path: string; params?: { filter?: Record<string, unknown> } }[]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_cle: unknown, path: string, options?: { params?: { filter?: Record<string, unknown> } }) => {
    appels.push({ path, params: options?.params });
    return { data: undefined, isLoading: true, isPending: true, isError: false, error: null };
  },
  useApiMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

import { leaseIdDeLUrl, MaintenanceList } from '../MaintenanceList';

const filtreDeLaListe = () => appels.filter((a) => a.path === '/api/maintenance-requests').at(-1)?.params?.filter;

describe('MaintenanceList — les interventions d’un bail (TCK-2919)', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it('`?filter[lease_id]=31` : la liste demande à l’API les seules interventions du bail 31', () => {
    nav.query = 'filter[lease_id]=31';
    render(withIntl(<MaintenanceList />));
    expect(filtreDeLaListe()?.lease_id).toBe(31);
  });

  it('avec un statut : les deux filtres partent ensemble', () => {
    nav.query = 'filter[lease_id]=31&status=open';
    render(withIntl(<MaintenanceList />));
    expect(filtreDeLaListe()).toMatchObject({ lease_id: 31, status: 'open' });
  });

  it('sans paramètre, ou illisible : aucun filtre de bail', () => {
    nav.query = '';
    render(withIntl(<MaintenanceList />));
    expect(filtreDeLaListe()?.lease_id).toBeUndefined();
    expect(leaseIdDeLUrl('abc')).toBeNull();
    expect(leaseIdDeLUrl('0')).toBeNull();
    expect(leaseIdDeLUrl('-3')).toBeNull();
    expect(leaseIdDeLUrl('12')).toBe(12);
  });
});
