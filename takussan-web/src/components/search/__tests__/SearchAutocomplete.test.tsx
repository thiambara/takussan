import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchAutocomplete } from '../SearchAutocomplete';
import frMessages from '@/messages/fr.json';

const mockPush = vi.fn();
let parametresUrl = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => parametresUrl,
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
    parametresUrl = new URLSearchParams();
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

  describe('`value` — la recherche en vigueur', () => {
    it('préremplit le champ, sans ouvrir la liste ni interroger les suggestions', async () => {
      const { useSuggest } = await import('@/hooks/useSuggest');
      const suggest = useSuggest as ReturnType<typeof vi.fn>;
      suggest.mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

      render(withProviders(<SearchAutocomplete value="villa piscine" />));

      expect(screen.getByRole('searchbox')).toHaveValue('villa piscine');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(suggest).toHaveBeenLastCalledWith('villa piscine', { enabled: false });
    });

    it('reste modifiable : la saisie remplace `q` et conserve les autres paramètres', async () => {
      parametresUrl = new URLSearchParams('q=villa&contract_type=sale');
      const { useSuggest } = await import('@/hooks/useSuggest');
      (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: false, isFetching: false });

      render(withProviders(<SearchAutocomplete value="villa" />));

      const input = screen.getByRole('searchbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'maison{Enter}');

      expect(mockPush).toHaveBeenCalledWith('/fr/properties?q=maison&contract_type=sale');
    });

    it('vider le champ puis Entrée retire `q`', async () => {
      parametresUrl = new URLSearchParams('q=villa&contract_type=sale');
      const { useSuggest } = await import('@/hooks/useSuggest');
      (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: false, isFetching: false });

      render(withProviders(<SearchAutocomplete value="villa" />));

      const input = screen.getByRole('searchbox');
      await userEvent.clear(input);
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockPush).toHaveBeenCalledWith('/fr/properties?contract_type=sale');
    });

    it('choisir une suggestion ramène le champ au terme en vigueur, pas à vide', async () => {
      parametresUrl = new URLSearchParams('q=villa');
      const { useSuggest } = await import('@/hooks/useSuggest');
      (useSuggest as ReturnType<typeof vi.fn>).mockReturnValue({ data: mockSuggestData, isLoading: false, isFetching: false });

      render(withProviders(<SearchAutocomplete value="villa" />));

      const input = screen.getByRole('searchbox');
      await userEvent.clear(input);
      await userEvent.type(input, 'da');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/fr/properties?q=villa&city=Dakar'));
      expect(input).toHaveValue('villa');
    });
  });
});
