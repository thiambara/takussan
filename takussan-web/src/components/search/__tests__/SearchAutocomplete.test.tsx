import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchAutocomplete } from '../SearchAutocomplete';
import frMessages from '@/messages/fr.json';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: null }),
}));

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const mockSuggestData = {
  data: {
    cities: [
      { label: 'Dakar', slug: 'dakar', count: 12 },
      { label: 'Darou', slug: 'darou', count: 3 },
    ],
    neighborhoods: [{ label: 'Almadies', city: 'Dakar', slug: 'almadies', count: 5 }],
    property_types: [],
  },
};

describe('SearchAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPush.mockReset();
  });

  it('renders empty state with placeholder and no dropdown', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: false, isFetching: false });

    render(withProviders(<SearchAutocomplete />));

    expect(screen.getByRole('searchbox')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('displays grouped suggestions on success', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

    render(withProviders(<SearchAutocomplete />));

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'da');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getByText('Dakar')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Almadies')).toBeInTheDocument();
  });

  it('navigates by arrow keys and Enter pushes route', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

    render(withProviders(<SearchAutocomplete />));

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'da');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    // TCK-439 — la langue est posée par le composant, plus laissée au 307 du proxy (ADR-0026).
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fr/properties?city=Dakar'));
  });

  it('submits free text as full-text query when no suggestion is selected', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

    render(withProviders(<SearchAutocomplete />));

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'appartement');

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockPush).toHaveBeenCalledWith('/fr/properties?q=appartement');
  });

  it('Escape closes dropdown', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

    render(withProviders(<SearchAutocomplete />));

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'da');

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  /**
   * TCK-507 — aucun TERME ne correspond : le panneau ne dit jamais « Aucun résultat » (il n'a
   * pas cherché dans les annonces) ; il propose la recherche plein-texte, qui construit la même
   * URL que Entrée sans suggestion active.
   */
  it('sans terme correspondant : pas de « Aucun résultat », une ligne d’action qui pousse `?q=`', async () => {
    const { useSuggest } = await import('@/hooks/useSuggest');
    (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { data: { cities: [], neighborhoods: [], property_types: [] } },
      isLoading: false,
      isFetching: false,
    });

    render(withProviders(<SearchAutocomplete />));

    const input = screen.getByRole('searchbox');
    await userEvent.type(input, 'apprtement');

    const action = await screen.findByRole('button', { name: 'Rechercher « apprtement » dans les annonces' });
    expect(screen.queryByText(/Aucun résultat/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tous les types')).not.toBeInTheDocument();

    await userEvent.click(action);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/fr/properties?q=apprtement');
  });
});
