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

// TCK-2624 — les blocs de l'admin (client, react-query) sont éprouvés par leurs propres tests.
vi.mock('@/components/accueil/admin/AFaireAdmin', () => ({ AFaireAdmin: () => <div data-testid="a-faire-admin" /> }));
vi.mock('@/components/accueil/admin/EquipeDuJour', () => ({ EquipeDuJour: () => <div data-testid="equipe-du-jour" /> }));
vi.mock('@/components/accueil/admin/ResumeDuJour', () => ({ ResumeDuJour: ({ jour }: { jour: string }) => jour }));
vi.mock('@/components/accueil/bailleur/AFaireBailleur', () => ({
  AFaireBailleur: ({ confirmeLesVisites, hote }: { confirmeLesVisites: boolean; hote: unknown }) => (
    <div data-testid="a-faire-bailleur" data-confirme={String(confirmeLesVisites)} data-hote={JSON.stringify(hote)} />
  ),
}));
vi.mock('@/components/accueil/bailleur/EnCoursSurVosBiens', () => ({ EnCoursSurVosBiens: () => <div data-testid="en-cours" /> }));
vi.mock('@/components/accueil/bailleur/ResumeDuBailleur', () => ({ ResumeDuBailleur: ({ jour }: { jour: string }) => jour }));
// TCK-2625 — les blocs du locataire, du client et du prestataire, doublés : la page les CHOISIT.
vi.mock('@/components/accueil/locataire/CarteDuLoyer', () => ({ CarteDuLoyer: () => <div data-testid="carte-du-loyer" /> }));
vi.mock('@/components/accueil/locataire/MonLogement', () => ({ MonLogement: () => <div data-testid="mon-logement" /> }));
vi.mock('@/components/accueil/locataire/EcheancesDes30Jours', () => ({ EcheancesDes30Jours: () => <div data-testid="echeances-30-jours" /> }));
vi.mock('@/components/accueil/locataire/ResumeDuLocataire', () => ({ ResumeDuLocataire: ({ jour }: { jour: string }) => jour }));
vi.mock('@/components/accueil/client/VosVisites', () => ({ VosVisites: ({ visites }: { visites: unknown[] }) => <div data-testid="vos-visites" data-n={visites.length} /> }));
vi.mock('@/components/accueil/client/VosRecherches', () => ({ VosRecherches: () => <div data-testid="vos-recherches" /> }));
vi.mock('@/components/accueil/client/FavorisQuiBougent', () => ({ FavorisQuiBougent: () => <div data-testid="favoris-qui-bougent" /> }));
vi.mock('@/components/accueil/prestataire/AccueilDuPrestataire', () => ({
  JourneeDuPrestataire: () => <div data-testid="journee-du-prestataire" />,
  AChiffrer: () => <div data-testid="a-chiffrer" />,
  ResumeDuPrestataire: ({ jour }: { jour: string }) => jour,
}));
vi.mock('@/lib/queries/public-search', () => ({ rechercherBiensPublics: async () => ({ data: [] }) }));
vi.mock('@/lib/access/tableau-du-bailleur', () => ({ vueBailleurOuverte: async () => true }));
vi.mock('@/lib/queries/dashboard', () => ({ fetchOwnerDashboard: async () => ({ data: { bookings: { pending: 2 }, reviews: { unanswered: 1 } } }) }));

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

  // TCK-2625 — le locataire n'a plus de « Ce mois » : ses chiffres (`overdue_amount`) contredisaient la carte
  // du loyer (« En retard 0 F » à côté de « 338 250 F à régler »). Son bail se rejoint par le menu (« Mon bail »).
  it('le locataire n’a pas de « Ce mois » : la carte du loyer porte seule le montant', async () => {
    ETAT.user = { id: 9, roles: ['customer', 'tenant'], agency_id: null, first_name: 'Ousmane' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: true, leases_active: 1, overdue_amount: 50000, recent_documents: [] }, sections: [] } };
    const { container } = await monter();

    expect(screen.getByTestId('carte-du-loyer')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="ce-mois"]')).toBeNull();
    expect(chiffres()).toHaveLength(0);
    // Pas de cellule vide à la place de « Ce mois » : la colonne commence à la hauteur de la carte.
    expect(container.querySelector('[class~="max-xl:order-last"]')).toBeNull();
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

  it('un compte sans chiffres ni blocs de son persona (opérateur sans agence active) garde son état vide', async () => {
    ETAT.user = { id: 5, roles: ['super_admin', 'customer'], agency_id: 3, first_name: 'Astou' };
    ETAT.agence = { ok: true, data: { id: 3, kind: 'standard', logo_url: 'x.png' } };
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

describe('TCK-2624 — les blocs de l’admin d’agence', () => {
  it('l’admin d’une agence standard : « À faire maintenant » à gauche, « Équipe aujourd’hui » dans la colonne, « Ce mois » en tuiles de colonne', async () => {
    await monter();

    expect(screen.getByTestId('a-faire-admin')).toBeInTheDocument();
    expect(screen.getByTestId('equipe-du-jour')).toBeInTheDocument();
    // Avec une colonne de droite, les tuiles ne s'étalent plus sur quatre colonnes au large.
    expect(document.querySelector('[data-slot="ce-mois"] ul.grid')?.className).not.toMatch(/xl:grid-cols-4/);
  });

  it('ni l’hôte (agence individuelle), ni le bailleur, ni le client : pas les blocs de l’admin', async () => {
    ETAT.agence = { ok: true, data: { id: 7, kind: 'individual', logo_url: 'x.png' } };
    await monter();
    expect(screen.queryByTestId('a-faire-admin')).toBeNull();

    ETAT.user = { id: 4, roles: ['owner'], agency_id: null, first_name: 'Mouhamed' };
    ETAT.lecture = { data: { role: 'owner', metrics: {}, sections: [] } };
    await monter();
    expect(screen.queryByTestId('a-faire-admin')).toBeNull();
    expect(screen.queryByTestId('equipe-du-jour')).toBeNull();
  });
});

describe('TCK-2624 (lot 2) — les blocs du bailleur et de l’hôte', () => {
  it('AC4 — le bailleur : « Loyers de novembre : 8 reçus sur 14 » lu depuis `rent_month`, « À faire » sans confirmation des visites, « En cours » dans la colonne', async () => {
    ETAT.user = { id: 4, roles: ['owner'], agency_id: null, first_name: 'Mouhamed' };
    ETAT.lecture = { data: { role: 'owner', metrics: { rent_month: { received_count: 8, expected_count: 14, received_amount: 11_400_000 } }, sections: [] } };
    await monter();
    expect(screen.getByRole('region', { name: /^Loyers de / }).textContent).toContain('8 reçus sur 14');
    expect(screen.getByTestId('a-faire-bailleur').dataset.confirme).toBe('false');
    expect(screen.getByTestId('a-faire-bailleur').dataset.hote).toBe('null');
    expect(screen.getByTestId('en-cours')).toBeInTheDocument();
    expect(screen.queryByTestId('a-faire-admin')).toBeNull();
  });

  it('l’hôte (admin d’une agence individuelle) : il confirme ses visites, et garde réservations et avis de la Vue bailleur', async () => {
    ETAT.agence = { ok: true, data: { id: 7, kind: 'individual', logo_url: 'x.png' } };
    await monter();
    const bloc = screen.getByTestId('a-faire-bailleur');
    expect(bloc.dataset.confirme).toBe('true');
    expect(JSON.parse(bloc.dataset.hote!)).toEqual({ reservations: { etat: 'pret', total: 2 }, avis: { etat: 'pret', total: 1 } });
    // Sans `rent_month` (vue `agency_admin`), aucune carte de loyers n'est inventée.
    expect(screen.queryByRole('region', { name: /^Loyers d/ })).toBeNull();
  });
});

describe('TCK-2625 — les blocs du locataire, du client et du prestataire', () => {
  const SITUATION = {
    has_customer_profile: true,
    leases_active: 1,
    overdue_amount: 0,
    maintenance_open: 2,
    bookings_pending: 1,
    visits_upcoming: [{ id: 11, scheduled_at: '2026-11-12T10:00:00Z', status: 'confirmed', property: { id: 3, title: 'Studio Mermoz' } }],
    recent_documents: [{ id: 8, name: 'Bail signé.pdf', type: 'lease', created_at: '2026-11-01T10:00:00Z' }],
  };

  it('AC4 — le locataire : la carte « Loyer » en tête, « Mon logement », et ce que « Ma situation » montrait', async () => {
    ETAT.user = { id: 9, roles: ['customer', 'tenant'], agency_id: null, first_name: 'Ousmane' };
    ETAT.lecture = { data: { role: 'tenant', metrics: SITUATION, sections: [] } };
    await monter();

    expect(screen.getByTestId('carte-du-loyer')).toBeInTheDocument();
    expect(screen.getByTestId('mon-logement')).toBeInTheDocument();
    // Les échéances lisent les dus (décision 6), éprouvées par `EcheancesDes30Jours.tck-2625.test.tsx`.
    expect(screen.getByTestId('echeances-30-jours')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documents récents' })).toBeInTheDocument();
    expect(screen.getByText('Bail signé.pdf')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ce qui m\'attend' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Réservations en attente/ }).getAttribute('href')).toBe('/app/bookings');
    expect(screen.queryByTestId('etat-vide')).toBeNull();
    // L'ordre du ticket au téléphone (et du document) : la carte, « Mon logement », les échéances, ce qui
    // m'attend, les documents ; au bureau, la carte SEULE à gauche, le reste dans la colonne.
    const ordre = [
      screen.getByTestId('carte-du-loyer'),
      screen.getByTestId('mon-logement'),
      screen.getByTestId('echeances-30-jours'),
      screen.getByRole('heading', { name: 'Ce qui m\'attend' }),
      screen.getByRole('heading', { name: 'Documents récents' }),
    ];
    for (let i = 1; i < ordre.length; i++) {
      expect(ordre[i - 1].compareDocumentPosition(ordre[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(screen.getByTestId('mon-logement').closest('[class*="xl:row-span-2"]')).toBeNull();
    expect(screen.getByTestId('carte-du-loyer').closest('[class*="xl:row-span-2"]')).not.toBeNull();
  });

  it('le locataire, `/dashboard/me` en panne : la carte, « Mon logement » et les échéances rendent ; « Ce qui m’attend » dit son erreur', async () => {
    ETAT.user = { id: 9, roles: ['customer', 'tenant'], agency_id: null, first_name: 'Ousmane' };
    ETAT.lecture = new Error('500');
    await monter();

    expect(screen.getByTestId('carte-du-loyer')).toBeInTheDocument();
    expect(screen.getByTestId('mon-logement')).toBeInTheDocument();
    // Les échéances lisent les dus, pas `/dashboard/me`.
    expect(screen.getByTestId('echeances-30-jours')).toBeInTheDocument();
    const [erreur] = screen.getAllByRole('alert');
    expect(erreur).toHaveTextContent('Impossible de charger ce qui vous attend.');
    fireEvent.click(within(erreur!).getByRole('button', { name: /Réessayer/ }));
    expect(rafraichir).toHaveBeenCalledTimes(1);
  });

  it('le client : ses visites, ses recherches et l’invitation à chercher, sans carte du loyer ni état vide', async () => {
    ETAT.user = { id: 9, roles: ['customer'], agency_id: null, first_name: 'Fatou' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { ...SITUATION, leases_active: 0 }, sections: [] } };
    const { container } = await monter();

    expect(screen.getByTestId('vos-visites').getAttribute('data-n')).toBe('1');
    expect(screen.getByTestId('vos-recherches')).toBeInTheDocument();
    // Les favoris qui bougent, entre les visites et les recherches (l'ordre de la maquette au téléphone).
    const favoris = screen.getByTestId('favoris-qui-bougent');
    expect(screen.getByTestId('vos-visites').compareDocumentPosition(favoris) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(favoris.compareDocumentPosition(screen.getByTestId('vos-recherches')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector('[data-slot="invitation-a-rechercher"]')).not.toBeNull();
    expect(screen.queryByTestId('carte-du-loyer')).toBeNull();
    expect(screen.queryByTestId('etat-vide')).toBeNull();
  });

  it('le client sans fiche : l’invitation à chercher, jamais l’état vide générique', async () => {
    ETAT.user = { id: 9, roles: ['customer'], agency_id: null, first_name: 'Fatou' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: false }, sections: [] } };
    const { container } = await monter();

    expect(container.querySelector('[data-slot="invitation-a-rechercher"]')).not.toBeNull();
    expect(screen.queryByTestId('etat-vide')).toBeNull();
  });

  it('AC6 — le prestataire : sa journée et « À chiffrer », ni état vide ni « Explorez les biens » ni « Ce mois »', async () => {
    ETAT.user = { id: 5, roles: ['service_provider', 'customer'], agency_id: null, first_name: 'Astou' };
    ETAT.lecture = { data: { role: 'tenant', metrics: { has_customer_profile: false }, sections: [] } };
    const { container } = await monter();

    expect(screen.getByTestId('journee-du-prestataire')).toBeInTheDocument();
    expect(screen.getByTestId('a-chiffrer')).toBeInTheDocument();
    expect(screen.queryByTestId('etat-vide')).toBeNull();
    expect(container.textContent).not.toMatch(/Explorez les biens/);
    expect(container.querySelector('[data-slot="ce-mois"]')).toBeNull();
    expect(container.querySelector('[data-slot="invitation-a-rechercher"]')).toBeNull();
  });
});
