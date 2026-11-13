import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

/**
 * TCK-2622 — le socle de l'accueil, rendu avec ses VRAIS composants (« Ce mois », en-tête, salut) :
 *
 *  - AC2 : « Impayés » est un lien vers la liste des impayés et porte ses deux unités ;
 *  - chaque chiffre de « Ce mois » est un lien ;
 *  - AC4 : un client avec une fiche mais sans bail (vue `tenant` de `/dashboard/me`) n'a aucun lien
 *    vers `/app/leases` ni `/app/payments` — c'était le cas des raccourcis (`isCustomerOnly`) ;
 *  - un bloc en échec n'éteint pas les autres : `/dashboard/me` en panne, le salut et les bandeaux
 *    rendent, « Ce mois » dit son erreur et propose « Réessayer » ;
 *  - plus de « Raccourcis », plus de « Vue d'ensemble de votre activité ».
 */
const { ETAT, rafraichir } = vi.hoisted(() => ({
  ETAT: {
    user: { id: 1, roles: ['agency_admin'] as string[], agency_id: 7 as number | null, first_name: 'Awa' },
    agence: { ok: true, data: { id: 7, kind: 'standard', logo_url: 'x.png' } } as unknown,
    lecture: null as unknown,
    kpis: [] as unknown[],
  },
  rafraichir: vi.fn(),
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: rafraichir }), usePathname: () => '/app' }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ETAT.user }));
vi.mock('@/app/actions/admin-agency', () => ({ fetchAgencyAction: async () => ETAT.agence }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => null }));
vi.mock('@/lib/queries/kpis', () => ({ fetchKpisActifs: async () => ETAT.kpis }));
vi.mock('@/lib/queries/dashboard-me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/dashboard-me')>()),
  fetchDashboardMe: async () => {
    if (ETAT.lecture instanceof Error) throw ETAT.lecture;
    return ETAT.lecture;
  },
}));
vi.mock('@/components/accueil/BandeauMiseEnService', () => ({ BandeauMiseEnService: () => <div data-testid="mise-en-service" /> }));
vi.mock('@/components/agency/BrandingBanner', () => ({ BrandingBanner: () => null }));
vi.mock('@/components/wizard/WizardDraftsBanner', () => ({ WizardDraftsBanner: () => <div data-testid="brouillons" /> }));
vi.mock('@/components/tenant/TenantOnboardingChecklistWidget', () => ({ TenantOnboardingChecklistWidget: () => null }));
vi.mock('@/components/dashboard/DashboardEmpty', () => ({ DashboardEmpty: () => <div data-testid="etat-vide" /> }));
vi.mock('@/components/journee/MaJournee', () => ({ MaJournee: () => <div data-testid="ma-journee" /> }));

import DashboardPage, { generateMetadata } from '../page';

const ADMIN = {
  data: {
    role: 'agency_admin',
    metrics: { properties_total: 82, properties_rented: 60, leases_active: 92, revenue_month: 95_200_000, overdue_count: 16, overdue_amount: 33_715_000, occupancy_rate_percent: 73 },
    sections: [],
  },
};

async function monter() {
  return render(withIntl(await DashboardPage()));
}

/** Les deux rendus de « Ce mois » : les puces du téléphone et les tuiles du bureau. */
function chiffres() {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-slot="ce-mois"] [data-chiffre]'));
}

beforeEach(() => {
  ETAT.user = { id: 1, roles: ['agency_admin'], agency_id: 7, first_name: 'Awa' };
  ETAT.agence = { ok: true, data: { id: 7, kind: 'standard', logo_url: 'x.png' } };
  ETAT.lecture = ADMIN;
  ETAT.kpis = [];
  rafraichir.mockReset();
});

describe('TCK-2622 — « Ce mois »', () => {
  it('chaque chiffre est un lien (téléphone et bureau) ; AC2 — « Impayés » mène aux impayés, avec « échéances » et « F »', async () => {
    await monter();

    const liens = chiffres();
    expect(liens).toHaveLength(8);
    for (const a of liens) {
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toMatch(/^\/app\//);
    }
    const impayes = liens.filter((a) => a.dataset.chiffre === 'impayes');
    expect(impayes).toHaveLength(2);
    for (const a of impayes) {
      expect(a).toHaveAttribute('href', '/app/agency/finances?tab=impayes');
      expect(a.textContent).toMatch(/16 échéances/);
      expect(a.textContent).toMatch(/33,7\sM\sF/);
    }
  });

  it('les KPI personnalisés de l’agence prennent la place des chiffres par défaut, avec leur libellé', async () => {
    ETAT.lecture = { data: { ...ADMIN.data, metrics: { ...ADMIN.data.metrics, customers_count: 120 } } };
    ETAT.kpis = [{ metric: 'customers_count', label: 'Clients suivis', format: 'number' }];
    await monter();

    const tuile = chiffres().find((a) => a.closest('.max-md\\:hidden'))!;
    expect(tuile).toHaveAttribute('href', '/app/customers');
    expect(tuile).toHaveTextContent('Clients suivis');
  });
});

describe('TCK-2622 — AC4 : le client sans bail', () => {
  it('vue `tenant` avec une fiche, sans bail : aucun lien vers /app/leases ni /app/payments', async () => {
    ETAT.user = { id: 9, roles: ['customer'], agency_id: null, first_name: 'Fatou' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: true, leases_active: 0, overdue_amount: 0, recent_documents: [] }, sections: [] } };
    const { container } = await monter();

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => h.startsWith('/app/leases') || h.startsWith('/app/payments'))).toEqual([]);
    expect(container.querySelector('[data-slot="ce-mois"]')).toBeNull();
  });

  it('le locataire, lui, garde ses chiffres en liens', async () => {
    ETAT.user = { id: 9, roles: ['customer', 'tenant'], agency_id: null, first_name: 'Ousmane' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: true, leases_active: 1, overdue_amount: 0, recent_documents: [] }, sections: [] } };
    await monter();

    expect(chiffres().map((a) => a.getAttribute('href'))).toContain('/app/leases');
  });
});

describe('TCK-2622 — un bloc en échec n’éteint pas les autres', () => {
  it('`/dashboard/me` en panne : le salut, la mise en service et les brouillons rendent ; « Ce mois » dit son erreur', async () => {
    ETAT.lecture = new Error('500');
    await monter();

    expect(screen.getAllByRole('heading', { level: 1 })[0]).toHaveTextContent('Bonjour');
    expect(screen.getAllByTestId('mise-en-service').length).toBeGreaterThan(0);
    expect(screen.getByTestId('brouillons')).toBeInTheDocument();
    const [erreur] = screen.getAllByRole('alert');
    expect(erreur).toHaveTextContent('Impossible de charger les chiffres du mois.');
    fireEvent.click(within(erreur!).getByRole('button', { name: /Réessayer/ }));
    expect(rafraichir).toHaveBeenCalledTimes(1);
  });

  it('l’agent, `/dashboard/me` en panne : sa journée quand même (le persona décide)', async () => {
    ETAT.user = { id: 3, roles: ['agent', 'customer'], agency_id: 7, first_name: 'Sokhna' };
    ETAT.lecture = new Error('500');
    await monter();

    expect(screen.getByTestId('ma-journee')).toBeInTheDocument();
  });
});

describe('TCK-2622 — le socle', () => {
  it('le salut au prénom et la date du jour en toutes lettres ; plus de « Raccourcis » ni de « Vue d’ensemble »', async () => {
    const { container } = await monter();

    const [h1] = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Bonjour');
    // « Mardi 10 novembre » : un jour de la semaine, un quantième, un mois, au calendrier de Dakar.
    expect(h1!.nextElementSibling?.textContent).toMatch(/^(Lundi|Mardi|Mercredi|Jeudi|Vendredi|Samedi|Dimanche) \d{1,2} \p{L}+$/u);
    expect(container.textContent).not.toMatch(/Raccourcis|Vue d'ensemble de votre activité/);
  });

  it('un compte sans chiffres (prestataire) garde son état vide, et rien de « Ce mois »', async () => {
    ETAT.user = { id: 5, roles: ['service_provider', 'customer'], agency_id: null, first_name: 'Astou' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: false }, sections: [] } };
    const { container } = await monter();

    expect(screen.getByTestId('etat-vide')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="ce-mois"]')).toBeNull();
  });
});

describe('TCK-2622 — le titre du document', () => {
  it('« Accueil » ; « Aujourd’hui » chez l’agent', async () => {
    expect((await generateMetadata()).title).toBe('Accueil');
    ETAT.user = { id: 3, roles: ['agent', 'customer'], agency_id: 7, first_name: 'Sokhna' };
    expect((await generateMetadata()).title).toBe('Aujourd’hui');
  });
});
