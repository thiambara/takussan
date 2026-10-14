import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-370, défaut n°2, l'autre moitié — **la page au bout du lien**.
 *
 * Le lien de menu ajouté par ce ticket ne vaut que si l'écran qu'il ouvre accepte celui qui a
 * cliqué. Cette propriété-là ne se lit pas dans la barre latérale : elle vit ici.
 *
 * L'accès suit ce que l'API autorise, et rien de plus large : `routes/api/integrations.php` ne
 * pose qu'`auth:sanctum`, et `IntegrationController::index` exige `isAgencyAdminAt` sur l'agence
 * de l'acteur.
 *
 * TCK-649 (ADR-0064 §1) — la page vit sous `/app/agency/integrations`, et n'a plus de barre
 * d'onglets : TCK-648 avait retiré « Général » (parti dans `/super-admin/settings/global`), et un
 * onglet seul n'est pas une navigation — c'était un lien vers la page où l'on est déjà.
 */

const garde = vi.hoisted(() => vi.fn(async (_chemin: string) => undefined));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

vi.mock('@/lib/access/pages-admin-server', () => ({ garderPageAdmin: (c: string) => garde(c) }));
vi.mock('@/app/actions/admin-settings', () => ({
  fetchIntegrationsAction: async () => ({ ok: true, data: { data: [] } }),
  fetchPaymentProviderSchemasAction: async () => ({ ok: true, data: [] }),
  fetchIntegrationWebhookEndpointAction: async () => ({ ok: false, message: '' }),
}));

// L'écran des intégrations lui-même est hors périmètre ; seuls son ACCÈS et sa coque sont en jeu.
vi.mock('@/components/admin-settings/IntegrationsManager', () => ({
  IntegrationsManager: () => <div data-testid="integrations-manager" />,
}));

async function rendPage() {
  const { default: Page } = await import('../page');
  render(await Page());
}

describe('/app/agency/integrations', () => {
  beforeEach(() => {
    garde.mockClear();
  });

  it('se garde par SON chemin de la table des pages', async () => {
    await rendPage();

    expect(garde).toHaveBeenCalledTimes(1);
    expect(garde).toHaveBeenCalledWith('/app/agency/integrations');
  });

  it("rend l'écran des intégrations une fois la garde passée", async () => {
    await rendPage();

    expect(screen.getByTestId('integrations-manager')).toBeInTheDocument();
  });

  it("ne monte plus de barre d'onglets : un onglet seul n'est pas une navigation", async () => {
    await rendPage();

    // …et l'absence n'est pas celle d'un rendu vide : l'en-tête de la page est bien là.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryAllByRole('link')).toEqual([]);
  });
});
