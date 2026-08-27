import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { SuperAdminPropertiesFilters } from '../SuperAdminPropertiesFilters';

/**
 * TCK-292 — le composant résout ses libellés par `useTranslations`. `withIntl` monte le VRAI
 * `fr.json` : les assertions françaises sont donc mot pour mot celles de l'écran.
 *
 * TCK-363 — deux tests de ce fichier décrivaient l'ancien comportement et sont remplacés :
 *
 * · « renders the agency filter populated from props » : le sélecteur n'a plus de props
 *   d'agences. Il en recevait 50, chargées au montage de la page, et taisait le reste.
 * · « debounces search via form submit » : ce n'était pas une temporisation. La recherche ne
 *   partait qu'à la soumission du formulaire, c'est-à-dire à la touche Entrée — un geste que
 *   rien n'annonçait, et qu'un utilisateur qui clique ailleurs ne fait jamais.
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

/** 63 agences : la 63ᵉ n'est atteignable par aucune liste coupée à 50. */
const CATALOGUE = Array.from({ length: 63 }, (_, index) => ({
  id: index + 1,
  name: index === 62 ? 'Ziguinchor Habitat' : `Agence ${String(index + 1).padStart(2, '0')}`,
}));

function mockAgencies() {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
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
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderFilters(props: { total?: number; busy?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminPropertiesFilters {...props} />
      </QueryClientProvider>,
    ),
  );
}

describe('<SuperAdminPropertiesFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('la 63ᵉ agence est sélectionnable et s’écrit dans l’URL — AC2 TCK-363', async () => {
    const user = userEvent.setup();
    mockAgencies();
    renderFilters();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await user.type(champ, 'Ziguinchor');

    await user.click(await screen.findByRole('option', { name: 'Ziguinchor Habitat' }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bagency_id%5D=63'),
    );
  });

  it('resets pagination when changing a filter', async () => {
    const user = userEvent.setup();
    mockAgencies();
    mockSearchParams.toString.mockReturnValue('page=4');
    renderFilters();

    await user.click(screen.getByLabelText('Statut'));
    const option = await screen.findByRole('option', { name: 'Disponible' });
    await user.click(option);

    expect(mockReplace).toHaveBeenCalled();
    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=available');
  });

  it('la recherche est TEMPORISÉE : 10 caractères ≤ 2 écritures d’URL — AC3 TCK-363', async () => {
    const user = userEvent.setup();
    mockAgencies();
    renderFilters();

    const champ = screen.getByLabelText('Rechercher un bien');
    await user.type(champ, 'appartemen');

    // Rien n'est encore parti : on est dans la fenêtre de temporisation.
    expect(mockReplace).not.toHaveBeenCalled();
    // Et l'interface n'est pas muette pour autant (AC4).
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockReplace.mock.calls.length).toBeLessThanOrEqual(2);
    expect(String(mockReplace.mock.calls.at(-1)?.[0])).toContain(
      'filter%5Bsearch%5D=appartemen',
    );
  });

  it('affiche le compte de résultats et vide l’URL à la réinitialisation — AC5 TCK-363', async () => {
    const user = userEvent.setup();
    mockAgencies();
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'filter[status]' ? 'available' : null,
    );
    mockSearchParams.toString.mockReturnValue('filter%5Bstatus%5D=available');
    renderFilters({ total: 128 });

    expect(screen.getByText('128 résultats')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(mockReplace).toHaveBeenLastCalledWith('?');
  });

  it('« réinitialiser » est inerte tant qu’aucun filtre n’est posé — AC5 TCK-363', () => {
    mockAgencies();
    renderFilters({ total: 0 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });
});
