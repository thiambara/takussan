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
}));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({ AvertissementNumeroNonVerifie: () => null }));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/PropertyKpiStrip', () => ({ PropertyKpiStrip: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));

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
  });

  it('ne force aucun tri quand une recherche est posée sans tri choisi', async () => {
    expect(await triDeLaListe({ search: 'villa' })).toBeUndefined();
  });

  it('garde le tri choisi, recherche ou non', async () => {
    expect(await triDeLaListe({ search: 'villa', sort: 'price' })).toBe('price');
    expect(await triDeLaListe({ sort: '-price' })).toBe('-price');
  });
});
