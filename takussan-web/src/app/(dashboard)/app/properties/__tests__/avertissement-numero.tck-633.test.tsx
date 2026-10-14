import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot C, tour 2) — le CÂBLAGE de l'avertissement « numéro non vérifié » dans « Mes
 * biens ». Le test du composant éprouve ce qu'il affiche ; il resterait vert si la page ne le
 * montait pas, ou lui passait un autre compte que le sien.
 */
const me = vi.hoisted(() => ({ user: null as User | null, enLigne: 0 }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => me.user }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: async (_token: string, params: { filters?: Record<string, string | undefined> }) => ({
    data: [],
    meta: { total: params.filters?.visibility === 'public' ? me.enLigne : 0, current_page: 1, last_page: 1, per_page: 1 },
  }),
}));

const rendu = vi.hoisted(() => ({ props: undefined as { phoneVerifiedAt?: string | null; annoncesEnLigne?: number } | undefined }));
vi.mock('@/components/contact/AvertissementNumeroNonVerifie', () => ({
  AvertissementNumeroNonVerifie: (props: { phoneVerifiedAt?: string | null; annoncesEnLigne?: number }) => {
    rendu.props = props;
    return null;
  },
}));
vi.mock('@/components/property-dashboard/PropertyList', () => ({ PropertyList: () => null }));
vi.mock('@/components/property-dashboard/PropertyListFilters', () => ({ PropertyListFilters: () => null }));
vi.mock('@/components/property-dashboard/PropertyPagination', () => ({ PropertyPagination: () => null }));
vi.mock('@/components/property-dashboard/PropertyKpiStrip', () => ({ PropertyKpiStrip: () => null }));
vi.mock('@/components/console', () => ({ PageHeader: () => null }));

async function propsPour(user: Partial<User>, enLigne: number) {
  me.user = { id: 1, roles: ['owner'], ...user } as unknown as User;
  me.enLigne = enLigne;
  rendu.props = undefined;
  const { default: Page } = await import('../(liste)/page');
  const arbre = await Page({ searchParams: Promise.resolve({}) });
  const { renderToStaticMarkup } = await import('react-dom/server');
  renderToStaticMarkup(arbre);
  return rendu.props;
}

describe('/app/properties — l’avertissement « numéro non vérifié »', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reçoit la vérification du compte connecté et le nombre d’annonces en ligne', async () => {
    expect(await propsPour({ phone_verified_at: null }, 3)).toEqual({ phoneVerifiedAt: null, annoncesEnLigne: 3 });
    expect(await propsPour({ phone_verified_at: '2026-10-01T00:00:00Z' }, 1)).toEqual({
      phoneVerifiedAt: '2026-10-01T00:00:00Z',
      annoncesEnLigne: 1,
    });
  });
});
