import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-777 (P15.08) — la mise en service est montée EN TÊTE de l'accueil (`/app`) pour tout admin
 * d'agence, `individual` compris : elle n'était montée que sur `/app/overview/agency`, réservé aux
 * agences `standard`, si bien que l'hôte solo ne la voyait jamais. Elle y reste aussi
 * (`overview/agency/__tests__/page.test.tsx`).
 *
 * TCK-2622 — sur l'accueil, elle est repliée en UNE ligne (`BandeauMiseEnService`) : au téléphone
 * au-dessus du salut, au bureau en bandeau de l'en-tête de page. Ce test regarde CE QUE la page monte,
 * et où ; ce que la ligne rend est éprouvé par `BandeauMiseEnService.tck-2622.test.tsx`.
 */
const { ETAT } = vi.hoisted(() => ({
  ETAT: {
    user: { id: 1, roles: ['agency_admin'] as string[], agency_id: 7 as number | null, first_name: 'Awa' },
    agence: { ok: true, data: { id: 7, kind: 'individual', logo_url: 'x.png' } } as unknown,
  },
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ETAT.user }));
vi.mock('@/app/actions/admin-agency', () => ({ fetchAgencyAction: async () => ETAT.agence }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => null }));
vi.mock('@/lib/queries/dashboard-me', () => ({
  fetchDashboardMe: async () => null,
  aDesChiffres: () => false,
}));
vi.mock('@/components/accueil/BandeauMiseEnService', () => ({
  BandeauMiseEnService: ({ agencyId, kind, large }: { agencyId: number; kind: string | null; large?: boolean }) => (
    <div data-testid={large ? 'mise-en-service-bureau' : 'mise-en-service'} data-agency={String(agencyId)} data-kind={String(kind)} />
  ),
}));
vi.mock('@/components/agency/BrandingBanner', () => ({ BrandingBanner: () => <div data-testid="bloc" /> }));
vi.mock('@/components/wizard/WizardDraftsBanner', () => ({ WizardDraftsBanner: () => <div data-testid="bloc" /> }));
vi.mock('@/components/tenant/TenantOnboardingChecklistWidget', () => ({
  TenantOnboardingChecklistWidget: () => <div data-testid="bloc" />,
}));
vi.mock('@/components/dashboard/DashboardEmpty', () => ({ DashboardEmpty: () => <div data-testid="bloc" /> }));
vi.mock('@/components/console', () => ({
  PageHeader: ({ title, bandeau }: { title: string; bandeau?: React.ReactNode }) => (
    <div data-testid="entete">
      {bandeau}
      <h1>{title}</h1>
    </div>
  ),
}));

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

import { withIntl } from '@/test/intl';

import DashboardPage from '../page';

beforeEach(() => {
  ETAT.user = { id: 1, roles: ['agency_admin'], agency_id: 7, first_name: 'Awa' };
  ETAT.agence = { ok: true, data: { id: 7, kind: 'individual', logo_url: 'x.png' } };
});

describe('accueil — la mise en service, en une ligne', () => {
  it('admin d’une agence individuelle : au téléphone AVANT le salut, au bureau dans le bandeau de l’en-tête', async () => {
    render(await DashboardPage());

    const ligne = screen.getByTestId('mise-en-service');
    expect(ligne).toHaveAttribute('data-agency', '7');
    expect(ligne).toHaveAttribute('data-kind', 'individual');
    const [salutTelephone] = screen.getAllByRole('heading', { level: 1 });
    // Au téléphone, la ligne précède le H1 « Bonjour … » (maquette `AccueilAdminMobile`).
    expect(ligne.compareDocumentPosition(salutTelephone!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Au bureau, en bandeau de l'en-tête de page (`TeteDePage bandeau`).
    expect(screen.getByTestId('entete')).toContainElement(screen.getByTestId('mise-en-service-bureau'));
  });

  it('admin d’une agence standard : montée aussi', async () => {
    ETAT.agence = { ok: true, data: { id: 7, kind: 'standard', logo_url: 'x.png' } };
    render(await DashboardPage());

    expect(screen.getByTestId('mise-en-service')).toHaveAttribute('data-kind', 'standard');
  });

  it('un compte qui n’administre pas d’agence : absente', async () => {
    ETAT.user = { id: 2, roles: ['customer'], agency_id: 7, first_name: 'Awa' };
    // TCK-2625 — le client voit l’invitation à chercher, qui lit ses libellés par next-intl.
    render(withIntl(await DashboardPage()));

    expect(screen.queryByTestId('mise-en-service')).toBeNull();
    expect(screen.queryByTestId('mise-en-service-bureau')).toBeNull();
  });
});
