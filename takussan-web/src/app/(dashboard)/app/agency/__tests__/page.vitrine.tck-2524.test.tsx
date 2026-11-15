import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-2524 — la vitrine (« Fiche publique ») ne se propose qu'à qui configure l'agence
 * (`AgencyPolicy::configure` : l'administrateur principal, ou `agency.update`).
 *
 * TCK-2670 — elle n'est plus un bloc à part, avec son propre enregistrement : c'est une section de la
 * fiche de l'agence, sous l'unique « Enregistrer ». La page ne juge plus que le DROIT, qu'elle passe
 * à la fiche (`vitrine`) ; la fiche montre ou cache la section (`sectionsMontrees`, lib/agence/fiche).
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
vi.mock('@/components/admin-agency/fiche/FicheDeLAgence', () => ({
  FicheDeLAgence: ({ agency, vitrine }: { agency: { id: number }; vitrine: boolean }) => (
    <form data-testid="fiche-de-l-agence" data-agency-id={agency.id} data-vitrine={String(vitrine)} />
  ),
}));

const fiche = () => screen.getByTestId('fiche-de-l-agence');

describe('/app/agency — la vitrine (TCK-2524, section de la fiche depuis TCK-2670)', () => {
  beforeEach(() => {
    ETAT.capacites = ['agency.update'];
    ETAT.primaryAdminId = 99;
  });

  it('est proposée, sur la bonne agence, à qui a la capacité de configurer', async () => {
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-agency-id', '7');
    expect(fiche()).toHaveAttribute('data-vitrine', 'true');
  });

  it('n’est pas proposée à un administrateur sans la capacité de configurer', async () => {
    ETAT.capacites = ['team.invite'];
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-vitrine', 'false');
  });

  it('est proposée à l’administrateur principal, même sans la capacité listée', async () => {
    ETAT.capacites = [];
    ETAT.primaryAdminId = 1;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-vitrine', 'true');
  });

  it('n’est pas proposée quand les capacités sont illisibles', async () => {
    ETAT.capacites = null;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-vitrine', 'false');
  });
});
