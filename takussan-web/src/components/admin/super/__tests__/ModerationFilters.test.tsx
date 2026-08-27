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
});
