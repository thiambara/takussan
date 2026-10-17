import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * TCK-777 (P15.08) — la carte « Mise en service » est montée EN TÊTE de l'accueil (`/app`) pour
 * tout admin d'agence, `individual` compris : elle n'était montée que sur `/app/overview/agency`,
 * réservé aux agences `standard`, si bien que l'hôte solo ne la voyait jamais. Elle y reste aussi
 * (`overview/agency/__tests__/page.test.tsx`).
 *
 * Les composants enfants sont des bouchons : ce test regarde CE QUE la page monte, et dans quel
 * ordre, pas ce que chacun rend.
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
vi.mock('@/lib/queries/dashboard-me', () => ({
  fetchDashboardMe: async () => null,
  aDesChiffres: () => false,
}));
vi.mock('@/components/dashboard/admin/MiseEnService', () => ({
  MiseEnService: ({ agencyId, kind }: { agencyId: number | null; kind?: string | null }) => (
    <div data-testid="mise-en-service" data-agency={String(agencyId)} data-kind={String(kind)} />
  ),
}));
vi.mock('@/components/agency/BrandingBanner', () => ({ BrandingBanner: () => <div data-testid="bloc" /> }));
vi.mock('@/components/wizard/WizardDraftsBanner', () => ({ WizardDraftsBanner: () => <div data-testid="bloc" /> }));
vi.mock('@/components/tenant/TenantOnboardingChecklistWidget', () => ({
  TenantOnboardingChecklistWidget: () => <div data-testid="bloc" />,
}));
vi.mock('@/components/dashboard/DashboardEmpty', () => ({ DashboardEmpty: () => <div data-testid="bloc" /> }));
vi.mock('@/components/dashboard/DashboardMeKpis', () => ({ DashboardMeKpis: () => <div data-testid="bloc" /> }));
vi.mock('@/components/dashboard/DashboardShortcuts', () => ({ DashboardShortcuts: () => <div data-testid="bloc" /> }));
vi.mock('@/components/console', () => ({ PageHeader: () => <header data-testid="entete" /> }));

import DashboardPage from '../page';

beforeEach(() => {
  ETAT.user = { id: 1, roles: ['agency_admin'], agency_id: 7, first_name: 'Awa' };
  ETAT.agence = { ok: true, data: { id: 7, kind: 'individual', logo_url: 'x.png' } };
});

describe('accueil — la carte « Mise en service »', () => {
  it('admin d’une agence individuelle : montée en tête, avec l’agence et son kind', async () => {
    render(await DashboardPage());

    const carte = screen.getByTestId('mise-en-service');
    expect(carte).toHaveAttribute('data-agency', '7');
    expect(carte).toHaveAttribute('data-kind', 'individual');
    // En tête : juste après l'en-tête de page, avant tout autre bloc.
    expect(screen.getByTestId('entete').nextElementSibling).toBe(carte);
  });

  it('admin d’une agence standard : montée aussi', async () => {
    ETAT.agence = { ok: true, data: { id: 7, kind: 'standard', logo_url: 'x.png' } };
    render(await DashboardPage());

    expect(screen.getByTestId('mise-en-service')).toHaveAttribute('data-kind', 'standard');
  });

  it('un compte qui n’administre pas d’agence : absente', async () => {
    ETAT.user = { id: 2, roles: ['customer'], agency_id: 7, first_name: 'Awa' };
    render(await DashboardPage());

    expect(screen.queryByTestId('mise-en-service')).toBeNull();
  });
});
