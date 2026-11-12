import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { User } from '@/types/user';

/**
 * TCK-865 (P02.08) — la liste pro des biens lance ses cinq compteurs en même temps que la liste.
 * Le compte « loués » attendait la réponse du compte « vendus » (`.then`) : une requête en série
 * sur chaque affichage de la page.
 *
 * TCK-1382 (P138.08) — sans filtre, « Total » est le `meta.total` de la liste : la liste et QUATRE
 * compteurs partent ensemble, et les compteurs passent par `countDashboardProperties`.
 */
type Params = { perPage?: number; filters?: Record<string, string | undefined> };
const appels = vi.hoisted(() => ({
  lances: [] as Params[],
  liberer: [] as Array<() => void>,
}));
const TOTAUX: Record<string, number> = { sold: 3, rented: 4, archived: 5 };

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['owner'] }) as unknown as User,
}));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: (_token: string, params: Params) => {
    appels.lances.push(params);
    const f = params.filters ?? {};
    const total = f.visibility === 'public' ? 2 : f.status ? (TOTAUX[f.status] ?? 0) : 1;
    return new Promise((resolve) => {
      appels.liberer.push(() =>
        resolve({ data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1 } }),
      );
    });
  },
  countDashboardProperties: (_token: string, filters: Record<string, string | undefined> = {}) => {
    appels.lances.push({ perPage: 1, filters });
    const total = filters.visibility === 'public' ? 2 : filters.status ? (TOTAUX[filters.status] ?? 0) : 1;
    return new Promise((resolve) => {
      appels.liberer.push(() => resolve(total));
    });
  },
  // TCK-2638 — en Gestion, les comptes viennent d'UN résumé du portefeuille.
  fetchPortfolioSummary: () => {
    appels.lances.push({ filters: { resume: '1' } });
    return new Promise((resolve) => {
      appels.liberer.push(() =>
        resolve({ total: 1, occupied: 0, vacant: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0, online: 0 }),
      );
    });
  },
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

function tuiles(noeud: ReactNode): Array<{ label: string; value: number }> | undefined {
  if (!noeud || typeof noeud !== 'object') return undefined;
  if (Array.isArray(noeud)) {
    for (const enfant of noeud) {
      const t = tuiles(enfant);
      if (t) return t;
    }
    return undefined;
  }
  const props = (noeud as ReactElement<{ tiles?: Array<{ label: string; value: number }>; children?: ReactNode }>).props;
  return props?.tiles ?? tuiles(props?.children);
}

describe('/app/properties — les compteurs', () => {
  beforeEach(() => {
    vi.resetModules();
    memoire.mode = 'annonces';
    appels.lances = [];
    appels.liberer = [];
  });

  it('lance la liste et les quatre compteurs sans attendre aucune réponse', async () => {
    const { default: Page } = await import('../(liste)/page');
    const rendu = Page({ searchParams: Promise.resolve({}) });
    await new Promise((r) => setTimeout(r, 0));

    expect(appels.lances).toHaveLength(5);
    expect(appels.lances.filter((p) => p.filters?.status === 'rented')).toHaveLength(1);

    appels.liberer.forEach((liberer) => liberer());
    const t = tuiles(await rendu);
    expect(t?.find((x) => x.label === 'soldRented')?.value).toBe(7);
  });

  it('en Gestion, lance la liste et le résumé du portefeuille sans attendre aucune réponse', async () => {
    memoire.mode = 'gestion';
    const { default: Page } = await import('../(liste)/page');
    const rendu = Page({ searchParams: Promise.resolve({}) });
    await new Promise((r) => setTimeout(r, 0));

    expect(appels.lances).toHaveLength(2);
    expect(appels.lances.filter((p) => p.filters?.resume === '1')).toHaveLength(1);

    appels.liberer.forEach((liberer) => liberer());
    await rendu;
  });
});
