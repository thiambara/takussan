import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

/**
 * TCK-662 (P01.01) — une recherche dans « Mes biens » ne force pas de tri : sans `sort=`, l'API
 * classe par pertinence. La page remplaçait tout tri absent par `-created_at`, et la pertinence
 * ne s'appliquait jamais.
 */
const appels = vi.hoisted(() => ({ liste: [] as Array<{ sort?: string; perPage?: number }> }));
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['owner'] }) as unknown as User,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: async (_token: string, params: { sort?: string; perPage?: number }) => {
    appels.liste.push(params);
    return { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 1 } };
  },
  countDashboardProperties: async () => 0,
  fetchPortfolioSummary: async () => ({
    total: 0, occupied: 0, vacant: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0, online: 0,
  }),
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/PropertyKpiStrip', () => ({ PropertyKpiStrip: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
// TCK-2638 — la page a deux modes. L'épingle vaut pour les deux : « Annonces » (la vue d'avant) et
// « Gestion », où la liste part avec le résumé du portefeuille.
const memoire = vi.hoisted(() => ({ mode: 'annonces' as string }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
}));

async function triDeLaListe(searchParams: Record<string, string>) {
  appels.liste = [];
  const { default: Page } = await import('../(liste)/page');
  await Page({ searchParams: Promise.resolve(searchParams) });
  const liste = appels.liste.filter((p) => p.perPage !== 1);
  expect(liste).toHaveLength(1);
  return liste[0].sort;
}

describe('/app/properties — le tri de la liste', () => {
  beforeEach(() => {
    vi.resetModules();
    memoire.mode = 'annonces';
  });

  for (const mode of ['annonces', 'gestion']) {
    it(`${mode} — ne force aucun tri quand une recherche est posée sans tri choisi`, async () => {
      memoire.mode = mode;
      expect(await triDeLaListe({ search: 'villa' })).toBeUndefined();
    });

    it(`${mode} — garde le tri choisi, recherche ou non`, async () => {
      memoire.mode = mode;
      expect(await triDeLaListe({ search: 'villa', sort: 'price' })).toBe('price');
      expect(await triDeLaListe({ sort: '-price' })).toBe('-price');
    });
  }
});
