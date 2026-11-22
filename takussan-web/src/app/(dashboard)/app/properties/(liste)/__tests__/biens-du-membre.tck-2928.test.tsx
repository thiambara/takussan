/**
 * TCK-2928 — « Biens suivis » de la fiche d'un membre de l'équipe ouvre `/app/properties?agent={id}` :
 * l'identifiant part en `filter[agent]` (TCK-2926) sur la liste ET sur les comptes du résumé, côté
 * serveur ; une valeur qui n'est pas un identifiant n'est pas relayée ; la puce du filtre est offerte.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const utilisateur = vi.hoisted(() => ({ roles: ['agency_admin'] as string[], agency_id: 3 as number | null }));
const recus = vi.hoisted(() => ({ filtres: [] as Record<string, unknown>[], jauges: [] as Record<string, unknown>[] }));
const lectures = vi.hoisted(() => ({
  abonnement: vi.fn(),
  bailleurs: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: utilisateur.roles, agency_id: utilisateur.agency_id, phone_verified_at: null }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => undefined }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/lib/queries/offre', () => ({ fetchAbonnement: (...a: unknown[]) => lectures.abonnement(...a) }));
vi.mock('@/lib/biens/bailleurs-du-filtre', () => ({ fetchBailleursDuFiltre: (...a: unknown[]) => lectures.bailleurs(...a) }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  PropertyListFilters: (props: Record<string, unknown> & { children?: React.ReactNode }) => {
    recus.filtres.push(props);
    return <>{props.children}</>;
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
  PastillesAnnonces: () => null,
  OngletsAnnonces: () => null,
  JaugeDuQuota: (props: Record<string, unknown>) => {
    recus.jauges.push(props);
    return null;
  },
  AfficherLesSuivants: () => null,
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => ({ used: 67, limit: 100, can_create: true }),
}));
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({ DeclarerEnTete: () => null }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));

import Page from '../page';

const RESUME = { total: 84, occupied: 61, vacant: 9, for_sale: 0, notice: 3, rent_late: 6, online: 67, pending_validation: 1, drafts: 4, offline: 12, sold_or_rented: 23, archived: 8 };
const BAILLEURS = [{ id: 40, name: 'Mouhamed Sène' }];

const listes = () =>
  apiRequest.mock.calls.map(([c]) => decodeURIComponent(String(c))).filter((u) => u.startsWith('/api/properties?'));

beforeEach(() => {
  utilisateur.roles = ['agency_admin'];
  utilisateur.agency_id = 3;
  recus.filtres = [];
  recus.jauges = [];
  lectures.abonnement.mockReset().mockResolvedValue({ id: 1, plan: { label: 'Pro' } });
  lectures.bailleurs.mockReset().mockResolvedValue(BAILLEURS);
  apiRequest.mockReset().mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: RESUME };
    return { data: [{ id: 1, title: 'Villa' }], meta: { current_page: 1, last_page: 1, per_page: 20, total: 1 } };
  });
});

const rendre = async (searchParams: Record<string, string>) => render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));

describe('TCK-2928 — les biens d’un membre (`?agent=`)', () => {
  it('`agent` part en `filter[agent]` sur la liste et sur le résumé', async () => {
    await rendre({ mode: 'gestion', agent: '3' });
    expect(listes()).toHaveLength(1);
    expect(listes()[0]).toContain('filter[agent]=3');
    const resume = apiRequest.mock.calls.map(([c]) => decodeURIComponent(String(c))).find((u) => u.startsWith('/api/properties/portfolio-summary'));
    expect(resume).toContain('filter[agent]=3');
  });

  it('une valeur qui n’est pas un identifiant n’est pas relayée', async () => {
    await rendre({ mode: 'gestion', agent: '3 OR 1=1' });
    expect(listes()[0]).not.toContain('filter[agent]');
    await rendre({ mode: 'annonces', agent: '0' });
    expect(listes().at(-1)).not.toContain('filter[agent]');
  });
});
