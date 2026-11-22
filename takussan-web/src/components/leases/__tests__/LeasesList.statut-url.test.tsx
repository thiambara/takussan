/**
 * TCK-1513 (P167.03) — `LeasesList` lit `?status=` à l'ouverture, comme `BookingsList` depuis
 * TCK-1293 : le lien « Baux à signer » de l'aperçu de l'agent ouvre la liste sur `pending_signature`.
 * Une valeur hors des statuts est ignorée.
 *
 * TCK-2644 — le statut est devenu un filtre de la liste de l'agence, qui l'emporte sur l'onglet ; le
 * bailleur le lit aussi. Les hooks de `leases-file` sont les vrais : la garde porte sur ce qui part à
 * l'API, `filter[status]`.
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
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/leases',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 } }) }));

const appels = vi.hoisted(() => [] as { path: string; params?: unknown }[]);
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_key: unknown, path: string, opts?: { params?: unknown }) => {
    appels.push({ path, params: opts?.params });
    return { data: { data: [] }, isLoading: false, isPending: false, isError: false, refetch: vi.fn() };
  },
  useApiMutation: vi.fn(),
}));

function requetesDesBaux(): string[] {
  return appels
    .filter((a) => a.path === '/api/leases')
    .map((a) => decodeURIComponent(buildQueryString(a.params as SpatieQueryParams)));
}

describe('LeasesList — statut porté par l’URL (TCK-1513)', () => {
  beforeEach(() => {
    appels.length = 0;
  });

  it('agence : ouvre sur le statut que nomme `?status=`, le filtre à l’API et l’affiche dans son filtre', () => {
    nav.query = 'status=pending_signature';
    render(withIntl(<LeasesList vue="agence" peutCreer={false} agencyId={1} />));

    expect(requetesDesBaux().at(-1)).toContain('filter[status]=pending_signature');
    expect(requetesDesBaux().at(-1)).not.toContain('filter[a_traiter]');
    expect(screen.getByRole('button', { name: `${fr.lease.liste.filtres.statut} : ${fr.lease.status.pending_signature}` })).toBeInTheDocument();
  });

  it('agence : ignore une valeur hors des statuts et ouvre sur la file « À traiter »', () => {
    nav.query = 'status=n_importe_quoi';
    render(withIntl(<LeasesList vue="agence" peutCreer={false} agencyId={1} />));

    expect(requetesDesBaux().at(-1)).not.toContain('filter[status]');
    expect(requetesDesBaux().at(-1)).toContain('filter[a_traiter]=1');
    // La file n'a pas de filtre de statut (ses motifs en tiennent lieu) : il reste celui des motifs, vide.
    expect(screen.queryByRole('button', { name: `${fr.lease.liste.filtres.statut} : ${fr.lease.liste.filtres.tousLesStatuts}` })).toBeNull();
    expect(screen.getByRole('button', { name: `${fr.lease.liste.filtres.motif} : ${fr.lease.liste.filtres.tousLesMotifs}` })).toBeInTheDocument();
  });

  it('bailleur : `?status=` filtre aussi sa liste', () => {
    nav.query = 'status=pending_signature';
    render(withIntl(<LeasesList vue="bailleur" peutCreer />));
    expect(requetesDesBaux().at(-1)).toContain('filter[status]=pending_signature');
  });
});
