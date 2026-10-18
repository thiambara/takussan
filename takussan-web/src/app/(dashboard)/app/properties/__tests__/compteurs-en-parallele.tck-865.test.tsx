import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type { User } from '@/types/user';

/**
 * TCK-865 (P02.08) — la liste pro des biens lance ses cinq compteurs en même temps que la liste.
 * Le compte « loués » attendait la réponse du compte « vendus » (`.then`) : une requête en série
 * sur chaque affichage de la page.
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
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/PropertyKpiStrip', () => ({ PropertyKpiStrip: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));

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
    appels.lances = [];
    appels.liberer = [];
  });

  it('lance la liste et les cinq compteurs sans attendre aucune réponse', async () => {
    const { default: Page } = await import('../(liste)/page');
    const rendu = Page({ searchParams: Promise.resolve({}) });
    await new Promise((r) => setTimeout(r, 0));

    expect(appels.lances).toHaveLength(6);
    expect(appels.lances.filter((p) => p.filters?.status === 'rented')).toHaveLength(1);

    appels.liberer.forEach((liberer) => liberer());
    const t = tuiles(await rendu);
    expect(t?.find((x) => x.label === 'soldRented')?.value).toBe(7);
  });
});
