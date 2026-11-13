import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-2596 (ADR-0096) — l'accueil de l'AGENT est « Ma journée » ; l'admin d'agence, le bailleur et le
 * client gardent le leur. Le rôle jugé est celui du profil ACTIF (`dashboard/me`), pas les rôles
 * globaux : un admin qui est aussi agent garde l'accueil de son profil actif. Le bandeau des
 * brouillons d'assistant reste en tête de la journée.
 */
const { ETAT } = vi.hoisted(() => ({
  ETAT: {
    user: { id: 3, roles: ['agent'] as string[], agency_id: 7 as number | null, first_name: 'Sokhna' },
    role: 'agent' as string,
  },
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => ETAT.user }));
vi.mock('@/app/actions/admin-agency', () => ({ fetchAgencyAction: async () => ({ ok: true, data: { id: 7, kind: 'standard', logo_url: 'x.png' } }) }));
vi.mock('@/lib/queries/dashboard-me', () => ({
  fetchDashboardMe: async () => ({ data: { role: ETAT.role, metrics: { properties_managed: 25, tasks_open: 10 }, sections: [] } }),
  aDesChiffres: () => true,
}));
vi.mock('@/components/journee/MaJournee', () => ({
  MaJournee: ({ chiffres, bandeau }: { chiffres: Record<string, unknown>; bandeau?: React.ReactNode }) => (
    <div data-testid="ma-journee" data-biens={String(chiffres.properties_managed)}>
      {bandeau}
    </div>
  ),
}));
vi.mock('@/components/dashboard/admin/MiseEnService', () => ({ MiseEnService: () => <div data-testid="mise-en-service" /> }));
vi.mock('@/components/agency/BrandingBanner', () => ({ BrandingBanner: () => null }));
vi.mock('@/components/wizard/WizardDraftsBanner', () => ({ WizardDraftsBanner: () => <div data-testid="brouillons" /> }));
vi.mock('@/components/tenant/TenantOnboardingChecklistWidget', () => ({ TenantOnboardingChecklistWidget: () => null }));
vi.mock('@/components/dashboard/DashboardEmpty', () => ({ DashboardEmpty: () => null }));
vi.mock('@/components/dashboard/DashboardMeKpis', () => ({ DashboardMeKpis: () => <div data-testid="tuiles" /> }));
vi.mock('@/components/dashboard/DashboardShortcuts', () => ({ DashboardShortcuts: () => <div data-testid="raccourcis" /> }));
vi.mock('@/components/console', () => ({ PageHeader: () => <header data-testid="entete" /> }));

import DashboardPage from '../page';

beforeEach(() => {
  ETAT.user = { id: 3, roles: ['agent'], agency_id: 7, first_name: 'Sokhna' };
  ETAT.role = 'agent';
});

describe('accueil — la journée de l’agent', () => {
  it('l’agent : « Ma journée », ses chiffres passés, les brouillons en tête ; ni salut ni tuiles', async () => {
    render(await DashboardPage());
    const journee = screen.getByTestId('ma-journee');
    expect(journee).toHaveAttribute('data-biens', '25');
    expect(journee.firstElementChild).toBe(screen.getByTestId('brouillons'));
    expect(screen.queryByTestId('tuiles')).toBeNull();
    expect(screen.queryByTestId('entete')).toBeNull();
  });

  it('un admin d’agence qui est aussi agent, sur son profil d’admin : son accueil, pas la journée', async () => {
    ETAT.user = { id: 1, roles: ['agency_admin', 'agent'], agency_id: 7, first_name: 'Awa' };
    ETAT.role = 'agency_admin';
    render(await DashboardPage());
    expect(screen.queryByTestId('ma-journee')).toBeNull();
    expect(screen.getByTestId('tuiles')).toBeInTheDocument();
    expect(screen.getByTestId('raccourcis')).toBeInTheDocument();
  });
});
