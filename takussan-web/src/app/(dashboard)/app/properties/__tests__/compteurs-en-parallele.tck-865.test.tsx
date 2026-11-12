import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

/**
 * TCK-865 (P02.08) — la liste pro des biens lance ses comptes en même temps que la liste : le compte
 * « loués » attendait la réponse du compte « vendus » (`.then`), une requête en série sur chaque
 * affichage de la page.
 *
 * TCK-2638 — les comptes des deux modes viennent d'UN résumé du portefeuille (`portfolio-summary`) :
 * plus aucune liste `per_page=1`. La liste, le résumé et, pour le personnel, le quota de l'agence
 * partent ensemble, sans attendre aucune réponse.
 */
type Params = { perPage?: number; filters?: Record<string, string | undefined> };
const appels = vi.hoisted(() => ({
  lances: [] as string[],
  liberer: [] as Array<() => void>,
  roles: ['owner'] as string[],
}));

function differe<T>(nom: string, valeur: T): Promise<T> {
  appels.lances.push(nom);
  return new Promise((resolve) => {
    appels.liberer.push(() => resolve(valeur));
  });
}

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: appels.roles }) as unknown as User,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: (_token: string, params: Params) =>
    differe(params.perPage === 1 ? 'compte' : 'liste', { data: [], meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 } }),
  fetchPortfolioSummary: () =>
    differe('resume', {
      total: 1, occupied: 1, vacant: 0, for_sale: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0, online: 0,
      pending_validation: 0, drafts: 0, offline: 1, sold_or_rented: 0, archived: 0,
    }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  fetchListingQuotaAction: () => differe('quota', { used: 1, limit: 10, can_create: true }),
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
const memoire = vi.hoisted(() => ({ mode: 'annonces' as string }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => memoire.mode }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
  PastillesAnnonces: () => null,
  OngletsAnnonces: () => null,
  JaugeDuQuota: () => null,
  AfficherLesSuivants: () => null,
}));

describe('/app/properties — les comptes partent avec la liste', () => {
  beforeEach(() => {
    vi.resetModules();
    appels.lances = [];
    appels.liberer = [];
    appels.roles = ['owner'];
  });

  for (const mode of ['annonces', 'gestion']) {
    it(`${mode} — la liste et le résumé partent ensemble ; aucun compte per_page=1`, async () => {
      memoire.mode = mode;
      const { default: Page } = await import('../(liste)/page');
      const rendu = Page({ searchParams: Promise.resolve({}) });
      await new Promise((r) => setTimeout(r, 0));

      expect(appels.lances.sort()).toEqual(['liste', 'resume']);

      appels.liberer.forEach((liberer) => liberer());
      await rendu;
    });
  }

  it('pour le personnel, le quota de l’agence part aussi avec eux', async () => {
    memoire.mode = 'annonces';
    appels.roles = ['agent'];
    const { default: Page } = await import('../(liste)/page');
    const rendu = Page({ searchParams: Promise.resolve({}) });
    await new Promise((r) => setTimeout(r, 0));

    expect(appels.lances.sort()).toEqual(['liste', 'quota', 'resume']);

    appels.liberer.forEach((liberer) => liberer());
    await rendu;
  });
});
