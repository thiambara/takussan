/**
 * TCK-2768 (q2 de la vérification de 7981e617d) — la liste des biens relayait `created_from` / `created_to` de
 * l'URL tels quels à `GET /api/properties` (`DateBoundaryFilter` : un jour ou un instant ISO). Un favori
 * « 12/11/2026 » ou « 2026-02-30 » y rend désormais 422, et la liste perdait ses biens. La borne refusée est
 * ignorée, comme la recherche publique écarte un `available_from` refusé. (Harnais repris de
 * `gestion.tck-2638.test.tsx`.)
*/
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type React from 'react';

import { withIntl } from '@/test/intl';

const apiRequest = vi.fn();
const memoire = vi.hoisted(() => ({ mode: undefined as string | undefined }));
const utilisateur = vi.hoisted(() => ({ roles: ['agent'] as string[] }));
const recus = vi.hoisted(() => ({
  avertissement: [] as unknown[],
  tuiles: [] as unknown[],
  liste: [] as unknown[],
  filtres: [] as unknown[],
  pastillesAnnonces: [] as unknown[],
  onglets: [] as unknown[],
  jauges: [] as { presentation: string; used: number; limit: number }[],
  suivants: [] as unknown[],
  pagination: [] as unknown[],
}));
const quota = vi.hoisted(() => ({ valeur: { used: 120, limit: 100 as number | null, can_create: false }, appels: 0 }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 7, first_name: 'Awa', last_name: 'Diop', roles: utilisateur.roles, phone_verified_at: null }),
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({
  PropertyList: (props: unknown) => {
    recus.liste.push(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({
  // TCK-2638 (lot B2) — la barre ENVELOPPE la liste et sa pagination : le double les rend en place.
  PropertyListFilters: (props: { sousLaBarre?: React.ReactNode; children?: React.ReactNode; pied?: React.ReactNode }) => {
    recus.filtres.push(props);
    return (
      <>
        {props.sousLaBarre}
        {props.children}
        {props.pied}
      </>
    );
  },
}));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({
  PropertyPagination: (props: unknown) => {
    recus.pagination.push(props);
    return null;
  },
}));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: ({ mode }: { mode: string }) => <p data-testid="mode">{mode}</p>,
  PastillesGestion: () => null,
  TuilesGestion: (props: unknown) => {
    recus.tuiles.push(props);
    return null;
  },
  PastillesAnnonces: (props: unknown) => {
    recus.pastillesAnnonces.push(props);
    return null;
  },
  OngletsAnnonces: (props: unknown) => {
    recus.onglets.push(props);
    return null;
  },
  JaugeDuQuota: (props: { presentation: string; used: number; limit: number }) => {
    recus.jauges.push(props);
    return null;
  },
  AfficherLesSuivants: (props: unknown) => {
    recus.suivants.push(props);
    return null;
  },
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: async () => {
    quota.appels += 1;
    return quota.valeur;
  },
}));
// L'action d'en-tête du téléphone (le « + » de la coque) est rendue en place, pour lire son libellé.
vi.mock('@/components/layout/en-tete-de-la-coque', () => ({
  DeclarerEnTete: ({ action }: { action?: React.ReactNode }) => <div data-testid="en-tete-de-la-coque">{action}</div>,
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({
  AvertissementNumeroNonVerifie: (props: unknown) => {
    recus.avertissement.push(props);
    return null;
  },
}));

import Page from '../page';

const RESUME = {
  total: 84,
  occupied: 61,
  vacant: 9,
  for_sale: 0,
  vacant_over_60_days: 2,
  notice: 3,
  rent_late: 6,
  rent_late_amount: 4_210_000,
  online: 67,
  pending_validation: 2,
  drafts: 5,
  offline: 10,
  sold_or_rented: 8,
  archived: 3,
};

let resume: typeof RESUME = RESUME;

const urls = () => apiRequest.mock.calls.map(([chemin]) => decodeURIComponent(String(chemin)));
const listes = () => urls().filter((u) => u.startsWith('/api/properties?'));

let derniere = 1;

beforeEach(() => {
  memoire.mode = undefined;
  utilisateur.roles = ['agent'];
  derniere = 1;
  resume = RESUME;
  quota.valeur = { used: 120, limit: 100, can_create: false };
  quota.appels = 0;
  for (const cle of Object.keys(recus) as (keyof typeof recus)[]) recus[cle] = [];
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (chemin: string) => {
    const u = decodeURIComponent(chemin);
    if (u.startsWith('/api/properties/portfolio-summary')) return { data: resume };
    const page = Number(/[?&]page=(\d+)/.exec(u)?.[1] ?? '1');
    const parPage = Number(/[?&]per_page=(\d+)/.exec(u)?.[1] ?? '20');
    return {
      data: page > derniere ? [] : [{ id: 1, title: 'Appartement F3' }],
      meta: { current_page: page, last_page: derniere, per_page: parPage, total: derniere * 20 + 30 },
    };
  });
});

const rendre = async (searchParams: Record<string, string> = {}) =>
  render(withIntl(await Page({ searchParams: Promise.resolve(searchParams) })));

describe('/app/properties — une borne de création que l’API refuserait est ignorée (TCK-2768)', () => {
  it('« 12/11/2026 » et « 2026-02-30 » ne partent pas ; un jour admis part', async () => {
    await rendre({ mode: 'gestion', created_from: '12/11/2026', created_to: '2026-02-30' });
    for (const u of listes()) {
      expect(u).not.toContain('created_from');
      expect(u).not.toContain('created_to');
    }
    expect(listes().length).toBeGreaterThan(0);

    apiRequest.mockClear();
    await rendre({ mode: 'gestion', created_from: '2026-10-01', created_to: '2026-11-12' });
    expect(listes().some((u) => u.includes('filter[created_from]=2026-10-01') && u.includes('filter[created_to]=2026-11-12'))).toBe(true);
  });
});
