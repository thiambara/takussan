import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { withIntl } from '@/test/intl';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-340 — les deux listes de clés qui avaient RÉELLEMENT dérivé du côté « recherche
 * sauvegardée », et que le ticket laissait hors de son delta.
 *
 * Le fichier est ici, et non sous `favorites/__tests__/`, parce que les deux composants qu'il
 * monte partagent une seule cause : `SEARCH_FILTER_KEYS`. Un test par composant les aurait
 * séparés au moment même où le refactor les réunit.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));

const mutateAsync = vi.fn();
const useSavedSearchesQuery = vi.fn();
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync, isPending: false }),
  useSavedSearchesQuery: () => useSavedSearchesQuery(),
  useDeleteSavedSearchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const { SaveSearchButton } = await import('@/components/favorites/SaveSearchButton');
const { SavedSearchesList } = await import('@/components/favorites/SavedSearchesList');

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  push.mockReset();
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue({ data: { id: 1 } });
  useSavedSearchesQuery.mockReset();
});

describe('<SaveSearchButton> — ce qui entre dans `criteria`', () => {
  /**
   * `sort` n'est pas un critère : c'est une préférence d'affichage. Le digest de notification
   * l'apparie côté serveur contre des biens neufs, où l'ordre n'a aucun sens.
   *
   * Une régression silencieuse ne cocherait pas ce test : elle ne peut le faire passer qu'en
   * écartant le tri POUR LA BONNE RAISON — l'assertion sur `city` et `furnished` interdit
   * d'écarter tout ce qui n'est pas dans une courte liste blanche.
   */
  it('écarte les CONTRÔLES (`sort`, `page`, `per_page`) et garde tous les filtres', async () => {
    const user = userEvent.setup();
    const filters: SearchFilters = {
      city: 'Dakar',
      furnished: true,
      type: ['villa'],
      sort: 'price_desc',
      page: 4,
      per_page: 70,
    };
    render(wrap(<SaveSearchButton filters={filters} activeCount={3} />));

    await user.click(screen.getByRole('button', { name: 'Sauvegarder la recherche' }));
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const { criteria } = mutateAsync.mock.calls[0][0] as { criteria: Record<string, unknown> };
    expect(criteria).toEqual({ city: 'Dakar', furnished: true, type: ['villa'] });
  });
});

describe('<SavedSearchesList> — le résumé d’une recherche sauvegardée', () => {
  function monteAvec(criteria: Record<string, unknown>) {
    useSavedSearchesQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { data: [{ id: 1, name: 'Ma recherche', criteria, notification_frequency: 'off' }] },
      refetch: vi.fn(),
    });
    render(wrap(<SavedSearchesList />));
  }

  /**
   * L'ancien résumé ne connaissait que six clés sur dix-sept. Une recherche sauvegardée sur
   * « meublé, quartier Almadies, en vedette, dispo dès le 1ᵉʳ septembre » s'affichait donc
   * « Aucun critère » — le repli EXACT d'une recherche vide. L'utilisateur ne pouvait pas
   * distinguer sa recherche la plus précise d'une recherche qui n'avait rien retenu.
   */
  it('nomme les filtres que l’ancienne version rendait INVISIBLES', () => {
    monteAvec({ furnished: true, featured: true, location: 'Almadies', available_from: '2026-09-01' });

    const resume = screen.getByText(/Meublé/);
    expect(resume.textContent).toContain('★ En vedette');
    expect(resume.textContent).toContain('Quartier : Almadies');
    expect(resume.textContent).toContain('Dispo dès');
    expect(screen.queryByText('Aucun critère')).toBeNull();
  });

  /** Le tri n'est pas un critère : il n'a pas à peupler le résumé non plus. */
  it('ne résume pas les contrôles', () => {
    monteAvec({ city: 'Thiès', sort: 'price_desc', page: 3, per_page: 70 });
    const resume = screen.getByText(/Thiès/);
    expect(resume.textContent?.trim()).toBe('Thiès');
  });

  /**
   * `criteria` vient du SERVEUR : c'est du JSON libre. Un `type` stocké en CHAÎNE — ce que
   * produit `criteriaToQueryString` lui-même au tour suivant — faisait planter le `.map` de
   * l'ancien résumé. L'aller-retour par les lecteurs d'URL le ramène à un tableau.
   */
  it('survit à un `type` stocké en chaîne plutôt qu’en tableau', () => {
    monteAvec({ type: 'villa,studio' });
    expect(screen.getByText(/Villa/).textContent).toContain('Studio');
  });

  it('rend « Aucun critère » quand il n’y a réellement aucun critère', () => {
    monteAvec({ sort: 'relevance' });
    expect(screen.getByText('Aucun critère')).toBeInTheDocument();
  });
});
