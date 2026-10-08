import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fr from '@/messages/fr.json';
import type { PlatformAbilities } from '@/lib/platform-abilities';
import { avecGestes } from '@/test/habilitations';
import { withIntl } from '@/test/intl';
import { GlobalSearch } from '../GlobalSearch';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const SUPPORT: PlatformAbilities = {
  level: 'support',
  abilities: ['platform.console.access', 'platform.users.view', 'platform.search.global'],
};
const VIEWER: PlatformAbilities = { level: 'viewer', abilities: ['platform.console.access'] };

const HITS = [
  { type: 'user', id: 4, label: 'Fatou Diop', sublabel: 'fatou@example.test', agency: null, url: '/super-admin/users/4' },
  { type: 'agency', id: 2, label: 'Fatou Immo', sublabel: 'fatou-immo', agency: null, url: '/super-admin/agencies/2' },
  { type: 'user', id: 9, label: 'Fatou Sarr', sublabel: 'sarr@example.test', agency: null, url: '/super-admin/users/9' },
  { type: 'lease', id: 7, label: 'BAIL-7', sublabel: null, agency: { id: 2, name: 'Fatou Immo' }, url: null },
];

function rendre(gestes: PlatformAbilities) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={queryClient}>{avecGestes(<GlobalSearch />, gestes)}</QueryClientProvider>));
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  push.mockReset();
  fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: HITS })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

/** TCK-600 (sous-partie 8) — recherche globale au clavier depuis toute page de la console. */
describe('<GlobalSearch>', () => {
  it('absente sous le niveau support : ni bouton, ni raccourci', async () => {
    rendre(VIEWER);
    expect(screen.queryByRole('button', { name: /Rechercher/ })).toBeNull();
    await userEvent.setup().keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Ctrl+K ouvre ; sous 2 caractères, aucun appel', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    const champ = await screen.findByRole('combobox');
    await u.type(champ, 'f');
    expect(screen.getByText('Au moins 2 caractères.')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('classe par type, se parcourt aux flèches et ouvre à Entrée', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Meta>}k{/Meta}');
    await u.type(await screen.findByRole('combobox'), 'fatou');

    const liste = await screen.findByRole('listbox');
    await waitFor(() => expect(within(liste).getAllByRole('option')).toHaveLength(4));
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/super-admin/search?q=fatou');
    // Les deux utilisateurs ensemble, sous leur type, avant les agences : l'ordre de l'API par groupe.
    expect(within(liste).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual([
      'Utilisateurs',
      'Agences',
      'Baux',
    ]);
    expect(within(liste).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Fatou Diopfatou@example.test',
      'Fatou Sarrsarr@example.test',
      'Fatou Immofatou-immo',
      'BAIL-7Fatou Immo',
    ]);

    await u.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(push).toHaveBeenCalledWith('/super-admin/agencies/2');
  });

  it('un résultat sans écran ne navigue pas', async () => {
    rendre(SUPPORT);
    const u = userEvent.setup();
    await u.keyboard('{Control>}k{/Control}');
    await u.type(await screen.findByRole('combobox'), 'fatou');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));

    await u.keyboard('{ArrowUp}{Enter}');
    expect(push).not.toHaveBeenCalled();
  });

  it('chaque type que le service émet a un libellé traduit', () => {
    const php = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..',
        'takussan-api', 'app', 'Services', 'Admin', 'AdminGlobalSearchService.php'),
      'utf8',
    );
    const types = [...new Set([...php.matchAll(/->hit\('([a-z_]+)'/g)].map((m) => m[1]))];
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((type) => !(type in fr.superAdmin.globalSearch.types))).toEqual([]);
  });
});
