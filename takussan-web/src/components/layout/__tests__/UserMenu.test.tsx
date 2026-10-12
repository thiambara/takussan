import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { UserMenu } from '../UserMenu';

/**
 * TCK-633 (lot B) — AC1 : l'entrée d'administration du menu utilisateur mène à une page qui
 * s'affiche (« Mon espace » chez un solo, rien s'il n'y en a aucune). AC3 : la déconnexion
 * VOLONTAIRE ramène à l'accueil, dans la langue de l'utilisateur.
 */
// `evenements` journalise la révocation ET la navigation dans l'ordre où elles ont lieu. La
// révocation ne se termine qu'après deux micro-tâches : une navigation lancée sans attendre
// `logout()` (`void logout()`, le défaut de TCK-509) s'intercale avant « logout:fin ».
const { push, replace, logout, evenements } = vi.hoisted(() => {
  const evenements: string[] = [];
  return {
    evenements,
    push: vi.fn(),
    replace: vi.fn((href: string) => { evenements.push(`replace:${href}`); }),
    logout: vi.fn(async () => {
      evenements.push('logout:debut');
      await Promise.resolve();
      await Promise.resolve();
      evenements.push('logout:fin');
    }),
  };
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ logout }) }));

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  avatar_url: null,
  roles: ['agency_admin'],
  agency_id: 7,
} as unknown as User;

const SOLO: AccesAdmin = { chemins: ['/admin/agency', '/admin/finances'], espaceIndividuel: true };
const STANDARD: AccesAdmin = { chemins: ['/admin', '/admin/agency'], espaceIndividuel: false };

async function ouvrir(acces: AccesAdmin, locale: LocaleDeTest = 'fr') {
  render(
    withIntl(
      <AccesAdminProvider acces={acces}>
        <UserMenu user={ADMIN} />
      </AccesAdminProvider>,
      locale,
    ),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  return user;
}

describe('<UserMenu> (TCK-633)', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    logout.mockClear();
    evenements.length = 0;
  });

  it('solo : « Mon espace » ouvre sa première page, jamais /admin', async () => {
    const user = await ouvrir(SOLO);
    expect(screen.queryByRole('menuitem', { name: 'Administration' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Mon espace' }));
    expect(push).toHaveBeenCalledWith('/admin/agency');
  });

  it('admin standard : « Administration » ouvre /admin', async () => {
    const user = await ouvrir(STANDARD);
    await user.click(await screen.findByRole('menuitem', { name: 'Administration' }));
    expect(push).toHaveBeenCalledWith('/admin');
  });

  it("aucune page accessible : pas d'entrée d'administration", async () => {
    await ouvrir({ chemins: [], espaceIndividuel: false });
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Mon profil', 'Déconnexion']);
  });

  it("la déconnexion ramène à l'accueil localisé, après avoir révoqué la session", async () => {
    const user = await ouvrir(STANDARD);
    await user.click(await screen.findByRole('menuitem', { name: 'Déconnexion' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/fr'));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalledWith('/auth/login');
    // L'ordre : la navigation n'a lieu qu'une fois la révocation TERMINÉE.
    expect(evenements).toEqual(['logout:debut', 'logout:fin', 'replace:/fr']);
  });

  it("en wolof, l'accueil wolof", async () => {
    const user = await ouvrir(STANDARD, 'wo');
    const items = await screen.findAllByRole('menuitem');
    await user.click(items[items.length - 1]);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/wo'));
  });
});
