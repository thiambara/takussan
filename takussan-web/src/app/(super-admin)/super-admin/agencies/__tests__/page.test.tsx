import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import SuperAdminAgenciesPage from '../page';

/**
 * TCK-363 — `/super-admin/agencies` est le troisième écran à champ de recherche de la console.
 * Il n'avait aucun test, et chaque frappe y partait au serveur : la barre de filtres n'annonçait
 * ni le nombre de résultats, ni comment revenir à la vue non filtrée.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));

function mockFetch(total = 128) {
  const spy = vi.fn(async (_input: RequestInfo | URL) => ({
    ok: true,
    json: async () => ({
      data: [],
      meta: { total, current_page: 1, last_page: 1, per_page: 15 },
    }),
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

/** Les requêtes portant un `filter[search]` non vide — les seules qui mesurent la frappe. */
function requetesDeRecherche(spy: ReturnType<typeof mockFetch>) {
  return spy.mock.calls.filter(([input]) =>
    new URL(String(input), 'http://localhost').searchParams.get('filter[search]'),
  );
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <SuperAdminAgenciesPage />
        </QueryClientProvider>
      </ToastProvider>,
    ),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('super-admin agencies page', () => {
  it('une saisie de 10 caractères déclenche au plus 2 requêtes de recherche — AC3 TCK-363', async () => {
    const user = userEvent.setup();
    const spy = mockFetch();
    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    await user.type(screen.getByLabelText('Rechercher une agence'), 'Ziguinchor');

    // Rien n'est parti pendant la frappe : la temporisation n'a pas encore échu.
    expect(requetesDeRecherche(spy)).toHaveLength(0);
    // Et l'attente se voit (AC4).
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    await waitFor(() => expect(requetesDeRecherche(spy).length).toBeGreaterThanOrEqual(1));
    expect(requetesDeRecherche(spy).length).toBeLessThanOrEqual(2);
    expect(
      new URL(String(requetesDeRecherche(spy).at(-1)?.[0]), 'http://localhost').searchParams.get(
        'filter[search]',
      ),
    ).toBe('Ziguinchor');
  });

  it('affiche le compte de résultats et réinitialise les filtres — AC5 TCK-363', async () => {
    const user = userEvent.setup();
    const spy = mockFetch(128);
    renderPage();

    expect(await screen.findByText('128 résultats')).toBeInTheDocument();

    // Tant qu'aucun filtre n'est posé, l'action est inerte plutôt qu'inexistante.
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();

    await user.type(screen.getByLabelText('Rechercher une agence'), 'Ziguinchor');
    await waitFor(() => expect(requetesDeRecherche(spy).length).toBeGreaterThanOrEqual(1));
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeEnabled();

    const avantRaz = requetesDeRecherche(spy).length;
    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));

    await waitFor(() =>
      expect(screen.getByLabelText('Rechercher une agence')).toHaveValue(''),
    );
    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
    // ⚠ On n'assère PAS « la dernière requête ne porte plus `filter[search]` » : la vue non
    // filtrée est déjà en cache (`staleTime: 15_000`), donc react-query ne la redemande pas et
    // la dernière requête émise reste celle de la recherche. La propriété vraie est qu'aucune
    // requête de recherche NOUVELLE ne part après la remise à zéro.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(requetesDeRecherche(spy)).toHaveLength(avantRaz);
  });
});
