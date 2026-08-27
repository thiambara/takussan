import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { UserRole } from '@/types/user';

/**
 * TCK-370, défaut n°2, l'autre moitié — **la page au bout du lien**.
 *
 * Le lien de menu ajouté par ce ticket ne vaut que si l'écran qu'il ouvre accepte celui qui a
 * cliqué, et si aucun de ses onglets ne le renvoie ailleurs. Ces deux propriétés-là ne se lisent
 * pas dans la barre latérale : elles vivent ici.
 *
 * L'accès suit ce que l'API autorise, et rien de plus large : `routes/api/integrations.php` ne
 * pose qu'`auth:sanctum`, et `IntegrationController::index` exige `isAgencyAdminAt` sur l'agence
 * de l'acteur. Côté `/admin/settings` en revanche, `routes/api/admin.php` est sous le middleware
 * `super-admin` — d'où l'onglet « Général » qui doit disparaître pour tout le monde sauf lui.
 *
 * ⚠ **Pourquoi `SettingsTabs` est doublé ici alors que le test veut justement voir ses liens.**
 * `SettingsTabs` est un composant SERVEUR asynchrone : React ne sait pas en rendre un imbriqué
 * sous un autre — mesuré, l'arbre entier suspend et le test ne voit qu'un `<div />` vide, donc ne
 * distingue plus « l'onglet a disparu » de « rien ne s'est affiché ». Le doublon CAPTURE les
 * props que la page lui donne réellement, et le dernier test les rejoue sur le VRAI composant.
 * La chaîne est donc complète et aucun de ses deux maillons n'est simulé.
 */

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

vi.mock('next/link', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const rolesCourants = { valeur: ['agency_admin'] as UserRole[] };

vi.mock('@/app/actions/auth', () => ({
  getMeAction: async () => ({
    id: 1,
    first_name: 'Awa',
    last_name: 'Ndiaye',
    full_name: 'Awa Ndiaye',
    roles: rolesCourants.valeur,
    agency_id: 7,
    avatar_url: null,
  }),
}));

vi.mock('@/app/actions/admin-settings', () => ({
  fetchIntegrationsAction: async () => ({ ok: true, data: { data: [] } }),
}));

// L'écran des intégrations lui-même est hors périmètre du ticket ; seul son ACCÈS est en jeu.
vi.mock('@/components/admin-settings/IntegrationsManager', () => ({
  IntegrationsManager: () => <div data-testid="integrations-manager" />,
}));

type PropsOnglets = { active: 'general' | 'integrations'; canSeeGeneral: boolean };
const propsRecues: PropsOnglets[] = [];

vi.mock('@/components/admin-settings/SettingsTabs', () => ({
  SettingsTabs: (props: PropsOnglets) => {
    propsRecues.push(props);
    return <div data-testid="settings-tabs-double" />;
  },
}));

async function rendPage(roles: UserRole[]) {
  rolesCourants.valeur = roles;
  const { default: Page } = await import('../page');
  render(await Page());
}

describe('/admin/settings/integrations', () => {
  beforeEach(() => {
    redirectMock.mockClear();
    propsRecues.length = 0;
  });

  it("n'éjecte pas un agency_admin, comme l'API ne l'éjecte pas", async () => {
    await rendPage(['agency_admin']);

    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('integrations-manager')).toBeInTheDocument();
  });

  it('demande des onglets sans « Général » pour un agency_admin, et avec pour un super_admin',
    async () => {
      await rendPage(['agency_admin']);
      expect(propsRecues.at(-1)).toMatchObject({ active: 'integrations', canSeeGeneral: false });

      await rendPage(['super_admin']);
      expect(propsRecues.at(-1)).toMatchObject({ active: 'integrations', canSeeGeneral: true });
    });

  it("ne rend, avec CES props-là, aucun lien vers une page qui rejette l'agency_admin",
    async () => {
      await rendPage(['agency_admin']);
      // `importActual` : le doublon ci-dessus intercepte AUSSI un import statique de ce fichier.
      const { SettingsTabs: vraisOnglets } = await vi.importActual<
        typeof import('@/components/admin-settings/SettingsTabs')
      >('@/components/admin-settings/SettingsTabs');
      // Les props ne sont pas réécrites à la main : ce sont celles que la page a produites.
      render(await vraisOnglets(propsRecues.at(-1)!));

      expect(screen.queryByRole('link', { name: 'Général' })).toBeNull();
      expect(
        screen.queryAllByRole('link').map((lien) => lien.getAttribute('href')),
      ).not.toContain('/admin/settings');
      // …et l'onglet utile est bien là : l'absence ci-dessus n'est pas celle d'un rendu vide.
      expect(screen.getByRole('link', { name: 'Intégrations' })).toHaveAttribute(
        'href',
        '/admin/settings/integrations',
      );
    });
});
