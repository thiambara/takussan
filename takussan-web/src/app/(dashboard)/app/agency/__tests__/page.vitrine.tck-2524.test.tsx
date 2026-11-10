import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-2524 — le bloc « Fiche publique » est monté sur `/app/agency`, HORS du formulaire de
 * configuration (son propre enregistrement), et seulement pour qui configure l'agence
 * (`AgencyPolicy::configure` : l'administrateur principal, ou `agency.update`).
 */
const ETAT = vi.hoisted(() => ({
  capacites: ['agency.update'] as readonly string[] | null,
  primaryAdminId: 99 as number | null,
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['agency_admin'], agency_id: 7 }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  garderPageAdmin: async () => undefined,
  capacitesDuProfilActif: async () => ETAT.capacites,
}));
vi.mock('@/app/actions/admin-agency', () => ({
  fetchAgencyAction: async () => ({
    ok: true,
    data: { id: 7, name: 'Agence Test', slug: 'agence-test', primary_admin_id: ETAT.primaryAdminId, settings: {} },
  }),
}));
vi.mock('@/components/admin-agency/AgencyConfigForm', () => ({
  AgencyConfigForm: () => <form data-testid="agency-config-form" />,
}));
vi.mock('@/components/admin-agency/RegenerateWatermarksCard', () => ({ RegenerateWatermarksCard: () => null }));
vi.mock('@/components/admin-agency/AgencyPublicProfileCard', () => ({
  AgencyPublicProfileCard: ({ agency }: { agency: { id: number } }) => <section data-testid="fiche-publique" data-agency-id={agency.id} />,
}));

describe('/app/agency — le bloc « Fiche publique » (TCK-2524)', () => {
  beforeEach(() => {
    ETAT.capacites = ['agency.update'];
    ETAT.primaryAdminId = 99;
  });

  it('est monté, sur la bonne agence, hors du formulaire de configuration', async () => {
    const { default: Page } = await import('../page');
    render(await Page());
    const bloc = screen.getByTestId('fiche-publique');
    expect(bloc).toHaveAttribute('data-agency-id', '7');
    expect(bloc.closest('form')).toBeNull();
  });

  it('n’est pas monté pour un administrateur sans la capacité de configurer', async () => {
    ETAT.capacites = ['team.invite'];
    const { default: Page } = await import('../page');
    render(await Page());
    expect(screen.queryByTestId('fiche-publique')).toBeNull();
    expect(screen.getByTestId('agency-config-form')).toBeInTheDocument();
  });

  it('est monté pour l’administrateur principal, même sans la capacité listée', async () => {
    ETAT.capacites = [];
    ETAT.primaryAdminId = 1;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(screen.getByTestId('fiche-publique')).toBeInTheDocument();
  });

  it('n’est pas monté quand les capacités sont illisibles', async () => {
    ETAT.capacites = null;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(screen.queryByTestId('fiche-publique')).toBeNull();
  });
});
