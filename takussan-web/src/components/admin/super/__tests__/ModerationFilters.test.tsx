import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { ModerationFilters } from '../moderation';

/**
 * TCK-363 — la barre de filtres de `/super-admin/moderation`.
 *
 * Aucun test ne la couvrait : elle recevait 50 agences en prop, et la 51ᵉ était introuvable sans
 * que rien ne le signale. Les assertions ci-dessous choisissent explicitement la 63ᵉ — un test
 * qui piocherait dans les vingt premières serait vert avec l'ancien `<Select>` tronqué.
 *
 * ⚠ Cet écran n'a **pas** de champ de recherche : l'AC3 (« au plus 2 requêtes pour 10
 * caractères ») ne s'y applique pas. Elle est couverte sur `/users`, `/properties` et dans le
 * test du sélecteur lui-même.
 */

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

const CATALOGUE = Array.from({ length: 63 }, (_, index) => ({
  id: index + 1,
  name: index === 62 ? 'Ziguinchor Habitat' : `Agence ${String(index + 1).padStart(2, '0')}`,
}));

function mockAgencies() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const search = url.searchParams.get('filter[search]')?.toLowerCase() ?? '';
      const trouvees = CATALOGUE.filter((a) => a.name.toLowerCase().includes(search));
      return {
        ok: true,
        json: async () => ({
          data: trouvees.slice(0, 20),
          meta: { total: trouvees.length, current_page: 1, last_page: 1, per_page: 20 },
        }),
      };
    }),
  );
}

function renderFilters(props: { total?: number } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <ModerationFilters {...props} />
      </QueryClientProvider>,
    ),
  );
}

describe('<ModerationFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
    mockAgencies();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('la 63ᵉ agence est sélectionnable et s’écrit dans l’URL — AC2 TCK-363', async () => {
    const user = userEvent.setup();
    renderFilters();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await user.type(champ, 'Ziguinchor');

    await user.click(await screen.findByRole('option', { name: 'Ziguinchor Habitat' }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bagency_id%5D=63'),
    );
  });

  it('affiche le compte de résultats et vide l’URL à la réinitialisation — AC5 TCK-363', async () => {
    const user = userEvent.setup();
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'filter[status]' ? 'flagged' : null,
    );
    mockSearchParams.toString.mockReturnValue('filter%5Bstatus%5D=flagged');
    renderFilters({ total: 42 });

    expect(screen.getByText('42 résultats')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(mockReplace).toHaveBeenLastCalledWith('?');
  });

  it('« réinitialiser » est inerte tant qu’aucun filtre n’est posé — AC5 TCK-363', () => {
    renderFilters({ total: 0 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
  });

  /**
   * TCK-363, D6 — MUTANT SURVIVANT : retirer `filter[agency_id]` de `PARAMS_DE_FILTRE` laissait
   * 3/3 tests verts. Le code était juste, c'est la GARDE qui manquait — et elle manquait sur le
   * filtre que ce ticket INTRODUIT sur cet écran.
   *
   * Conséquence : l'agence posée seule, `filtresPoses` faux, « Réinitialiser » désactivé —
   * l'utilisateur ne peut plus lever d'un geste le filtre qu'il vient de poser.
   */
  it.each([
    ['filter[type]', 'property'],
    ['filter[status]', 'flagged'],
    ['filter[agency_id]', '63'],
    ['sort', 'reported_at'],
  ])('un %s posé SEUL active « Réinitialiser » — AC5 D6 TCK-363', (cle, valeur) => {
    mockSearchParams.get.mockImplementation((k: string) => (k === cle ? valeur : null));
    renderFilters({ total: 3 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });

  /**
   * TCK-363, D8 — « Réinitialiser » vide l'URL, donc la pagination aussi. Sur `?page=5` sans
   * filtre, un bouton désactivé annonçait un état par défaut qui n'était pas celui de l'écran.
   */
  it('« réinitialiser » est actif sur ?page=5 sans aucun filtre — D8 TCK-363', () => {
    mockSearchParams.get.mockImplementation((k: string) => (k === 'page' ? '5' : null));
    renderFilters({ total: 3 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });
});
