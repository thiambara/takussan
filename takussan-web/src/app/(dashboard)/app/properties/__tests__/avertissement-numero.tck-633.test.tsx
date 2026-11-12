import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot C, tour 2) — le CÂBLAGE de l'avertissement « numéro non vérifié » dans « Mes
 * biens ». Le test du composant éprouve ce qu'il affiche ; il resterait vert si la page ne le
 * montait pas, ou lui passait un autre compte que le sien.
 *
 * TCK-2638 — dans les deux modes, le compte « en ligne » est celui du résumé du portefeuille
 * (`online`, `is_online`, ADR-0097) : la même règle que le catalogue (`Property::public()`, TCK-2036),
 * sans liste de comptage.
 */
const me = vi.hoisted(() => ({ user: null as User | null, enLigne: 0, mode: 'annonces' }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => me.user }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (cle: string) => cle }));
vi.mock('@/lib/queries/properties-server', () => ({
  fetchDashboardProperties: async () => ({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 20 } }),
  fetchPortfolioSummary: async () => ({
    total: 9, occupied: 1, vacant: 1, for_sale: 0, vacant_over_60_days: 0, notice: 0, rent_late: 0, rent_late_amount: 0,
    online: me.enLigne, pending_validation: 0, drafts: 0, offline: 9 - me.enLigne, sold_or_rented: 0, archived: 0,
  }),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({ fetchListingQuotaAction: async () => null }));

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
vi.mock('@/components/console', () => ({ PageHeader: () => null }));
vi.mock('@/lib/biens/mode-memorise', () => ({ modeMemoriseDesBiens: async () => me.mode }));
vi.mock('@/components/property-dashboard/ModesDeLaListe', () => ({
  SelecteurDeMode: () => null,
  PastillesGestion: () => null,
  TuilesGestion: () => null,
  PastillesAnnonces: () => null,
  OngletsAnnonces: () => null,
  JaugeDuQuota: () => null,
  AfficherLesSuivants: () => null,
}));

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

  for (const mode of ['annonces', 'gestion']) {
    it(`${mode} — reçoit la vérification du compte connecté et le nombre d’annonces en ligne`, async () => {
      me.mode = mode;
      expect(await propsPour({ phone_verified_at: null }, 3)).toEqual({ phoneVerifiedAt: null, annoncesEnLigne: 3 });
      expect(await propsPour({ phone_verified_at: '2026-10-01T00:00:00Z' }, 1)).toEqual({
        phoneVerifiedAt: '2026-10-01T00:00:00Z',
        annoncesEnLigne: 1,
      });
    });
  }
});
