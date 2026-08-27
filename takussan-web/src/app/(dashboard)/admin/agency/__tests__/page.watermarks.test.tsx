import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-370, défaut n°3 — **le composant est monté, et il l'est HORS du formulaire**.
 *
 * Un composant d'action qui n'est monté nulle part est exactement le défaut que ce ticket
 * corrige ; l'éprouver isolément, comme le fait `RegenerateWatermarksCard.test.tsx`, ne dit rien
 * de son site d'appel. Ce fichier-ci ne teste que ça.
 *
 * Le second test porte une contrainte de HTML : `AgencyConfigForm` est un `<form>` entier. Un
 * bouton posé dedans partagerait sa soumission, et un `<form>` imbriqué n'est pas valide.
 */

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({
    id: 1,
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    roles: ['agency_admin'],
    agency_id: 7,
    avatar_url: null,
  }),
}));

vi.mock('@/app/actions/admin-agency', () => ({
  fetchAgencyAction: async () => ({
    ok: true,
    data: { id: 7, name: 'Agence Test', slug: 'agence-test', commission_rate: 5, settings: {} },
  }),
}));

// Le formulaire de configuration n'est pas le sujet ; on garde sa NATURE (`<form>`), qui l'est.
vi.mock('@/components/admin-agency/AgencyConfigForm', () => ({
  AgencyConfigForm: () => <form data-testid="agency-config-form" />,
}));

vi.mock('@/components/admin-agency/RegenerateWatermarksCard', () => ({
  RegenerateWatermarksCard: ({ agencyId }: { agencyId: number }) => (
    <div data-testid="watermarks-card" data-agency-id={agencyId} />
  ),
}));

describe('/admin/agency', () => {
  it('monte la regénération des filigranes, sur la bonne agence', async () => {
    const { default: Page } = await import('../page');
    render(await Page());

    expect(screen.getByTestId('watermarks-card')).toHaveAttribute('data-agency-id', '7');
  });

  it("la monte HORS du formulaire de configuration", async () => {
    const { default: Page } = await import('../page');
    render(await Page());

    expect(screen.getByTestId('watermarks-card').closest('form')).toBeNull();
  });
});
