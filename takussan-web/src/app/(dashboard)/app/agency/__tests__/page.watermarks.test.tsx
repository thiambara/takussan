import { beforeEach, describe, expect, it, vi } from 'vitest';
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
 *
 * TCK-633 (décision du porteur, 2026-10-12) — la carte n'est montée que si le filigrane est allumé
 * pour la plateforme (`watermark_available`, rendu par l'API) : éteint, elle promettait un
 * filigrane qu'aucune photo ne recevrait.
 */

const agence = vi.hoisted(() => ({ watermark_available: true as boolean | undefined }));

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

vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined }));
vi.mock('@/app/actions/admin-agency', () => ({
  fetchAgencyAction: async () => ({
    ok: true,
    data: {
      id: 7,
      name: 'Agence Test',
      slug: 'agence-test',
      commission_rate: 5,
      settings: {},
      watermark_available: agence.watermark_available,
    },
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

describe('/app/agency', () => {
  beforeEach(() => {
    agence.watermark_available = true;
  });

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

  it('ne la monte pas quand le filigrane est éteint pour la plateforme', async () => {
    agence.watermark_available = false;
    const { default: Page } = await import('../page');
    render(await Page());

    expect(screen.queryByTestId('watermarks-card')).toBeNull();
    expect(screen.getByTestId('agency-config-form')).toBeInTheDocument();
  });

  it("ne la monte pas quand l'API ne dit rien (réponse d'avant TCK-633)", async () => {
    agence.watermark_available = undefined;
    const { default: Page } = await import('../page');
    render(await Page());

    expect(screen.queryByTestId('watermarks-card')).toBeNull();
  });
});
