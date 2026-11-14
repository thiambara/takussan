import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-370, défaut n°3 — la regénération des filigranes est MONTÉE : un composant d'action qui n'est
 * monté nulle part est le défaut que ce ticket corrigeait.
 *
 * TCK-633 (décision du porteur, 2026-10-12) — seulement si le filigrane est allumé pour la plateforme
 * (`watermark_available`, rendu par l'API) : éteint, elle promettait un filigrane qu'aucune photo ne
 * recevrait.
 *
 * TCK-2670 — la carte vit dans la section « Identité » de la fiche ; la page passe le drapeau
 * (`filigranes`). Que la carte soit montée dans la section, et que son bouton ne soumette pas le
 * formulaire, s'éprouve sur la fiche : `components/admin-agency/fiche/__tests__/`.
 */

const agence = vi.hoisted(() => ({ watermark_available: true as boolean | undefined }));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({ id: 1, roles: ['agency_admin'], agency_id: 7 }),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: async () => undefined, capacitesDuProfilActif: async () => [] }));
vi.mock('@/app/actions/admin-agency', () => ({
  fetchAgencyAction: async () => ({
    ok: true,
    data: { id: 7, name: 'Agence Test', slug: 'agence-test', commission_rate: 5, settings: {}, watermark_available: agence.watermark_available },
  }),
}));
vi.mock('@/components/admin-agency/fiche/FicheDeLAgence', () => ({
  FicheDeLAgence: ({ agency, filigranes }: { agency: { id: number }; filigranes: boolean }) => (
    <form data-testid="fiche-de-l-agence" data-agency-id={agency.id} data-filigranes={String(filigranes)} />
  ),
}));

const fiche = () => screen.getByTestId('fiche-de-l-agence');

describe('/app/agency — la regénération des filigranes', () => {
  beforeEach(() => {
    agence.watermark_available = true;
  });

  it('est proposée, sur la bonne agence, quand le filigrane est allumé', async () => {
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-agency-id', '7');
    expect(fiche()).toHaveAttribute('data-filigranes', 'true');
  });

  it('ne l’est pas quand le filigrane est éteint pour la plateforme', async () => {
    agence.watermark_available = false;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-filigranes', 'false');
  });

  it("ne l'est pas quand l'API ne dit rien (réponse d'avant TCK-633)", async () => {
    agence.watermark_available = undefined;
    const { default: Page } = await import('../page');
    render(await Page());
    expect(fiche()).toHaveAttribute('data-filigranes', 'false');
  });
});
