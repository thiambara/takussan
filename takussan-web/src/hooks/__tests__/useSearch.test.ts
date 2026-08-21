import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockReplace = vi.fn();
const mockPush = vi.fn();
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

import { useSearch } from '../useSearch';
import { ApiError } from '@/lib/api';

function monte(url: string) {
  parametres = new URLSearchParams(url);
  return renderHook(() => useSearch());
}

beforeEach(() => {
  mockReplace.mockClear();
  mockPush.mockClear();
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ data: [], facets: {}, meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 } });
});

describe('TCK-335 — lecture des booléens depuis l’URL', () => {
  it('lit `furnished=1` comme VRAI', async () => {
    const { result } = monte('furnished=1');
    expect(result.current.filters.furnished).toBe(true);
  });

  it('lit `furnished=0` comme FAUX', async () => {
    const { result } = monte('furnished=0');
    expect(result.current.filters.furnished).toBe(false);
  });

  it('lit `furnished=true` comme VRAI', async () => {
    const { result } = monte('furnished=true');
    expect(result.current.filters.furnished).toBe(true);
  });

  /**
   * `featured` est UNILATÉRAL côté serveur : `featured=false` ne filtre rien. Le lire
   * comme `false` ferait afficher une puce « ★ En vedette » au-dessus d’un résultat
   * NON filtré — la puce affirmerait un état que la recherche n’a pas.
   */
  it('ignore `featured=false` plutôt que d’en faire un filtre actif', () => {
    const { result } = monte('featured=false');
    expect(result.current.filters.featured).toBeUndefined();
    expect(result.current.activeCount).toBe(0);
  });

  it('lit `featured=true` comme un filtre actif', () => {
    const { result } = monte('featured=true');
    expect(result.current.filters.featured).toBe(true);
    expect(result.current.activeCount).toBe(1);
  });
});

describe('TCK-335 — retrait du filtre texte', () => {
  /**
   * `filtersFromSearchParams` lit `q ?? search` : les deux alimentent la MÊME puce.
   * `removeFilter` n’en supprimait qu’un, donc la puce était irrémovable sur `?search=`.
   */
  it('retire aussi `search` quand on retire `q`', () => {
    const { result } = monte('search=villa');
    expect(result.current.filters.q).toBe('villa');

    act(() => { result.current.removeFilter('q'); });

    // `removeFilter` empile depuis l'étape 5 : le retrait d'un filtre est un geste discret.
    const url = mockPush.mock.calls.at(-1)?.[0] as string;
    expect(url).not.toContain('search=villa');
    expect(url).not.toContain('q=villa');
  });
});

describe('TCK-335 — l’erreur est portée, pas jetée', () => {
  it('expose l’ApiError et n’expose aucun résultat sur un 422', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(422, { errors: { furnished: ['invalide'] } }));
    const { result } = monte('furnished=true');

    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect((result.current.error as ApiError).status).toBe(422);
    expect(result.current.data).toBeNull();
  });

  /**
   * Un 5xx n’invalide pas ce qui était juste il y a une seconde : on garde l’affichage.
   * Un 422, lui, désigne la recherche COURANTE comme invalide — garder l’ancienne liste
   * la présenterait comme le résultat du filtre demandé.
   */
  it('conserve le résultat précédent sur un 500', async () => {
    const resultat = { data: [{ id: 1 }], facets: {}, meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 } };
    mockApiFetch.mockResolvedValueOnce(resultat);
    const { result, rerender } = monte('city=Dakar');
    await waitFor(() => expect(result.current.data).not.toBeNull());

    mockApiFetch.mockRejectedValue(new ApiError(500, null));
    parametres = new URLSearchParams('city=Thies');
    rerender();
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(result.current.data).not.toBeNull();
  });

  it('JETTE le résultat précédent sur un 422', async () => {
    const resultat = { data: [{ id: 1 }], facets: {}, meta: { total: 1, per_page: 30, current_page: 1, last_page: 1 } };
    mockApiFetch.mockResolvedValueOnce(resultat);
    const { result, rerender } = monte('city=Dakar');
    await waitFor(() => expect(result.current.data).not.toBeNull());

    mockApiFetch.mockRejectedValue(new ApiError(422, { errors: { area_min: ['invalide'] } }));
    parametres = new URLSearchParams('city=Dakar&area_min=-5');
    rerender();
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    // Garder l'ancienne liste la présenterait comme le résultat du filtre demandé.
    expect(result.current.data).toBeNull();
  });
});

describe('TCK-335 — taxonomie push / replace', () => {
  /**
   * Tout passait par `replace`, donc l'historique ne grandissait jamais : un visiteur qui
   * posait cinq filtres puis appuyait une fois sur Précédent QUITTAIT la recherche.
   * Mais `push` partout serait pire — sans l'anti-rebond de l'étape 3, « Dakar » empilerait
   * cinq entrées. La ligne de partage est le GESTE, pas le filtre.
   */
  it('empile un geste discret', () => {
    const { result } = monte('');
    act(() => { result.current.search({ contract_type: 'rent' }); });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('écrase sur un commit de champ continu', () => {
    const { result } = monte('');
    act(() => { result.current.search({ city: 'Dakar' }, { historique: 'replace' }); });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('empile la pagination, le retrait de filtre et la réinitialisation', () => {
    const { result } = monte('city=Dakar');
    act(() => { result.current.setPage(2); });
    act(() => { result.current.removeFilter('city'); });
    act(() => { result.current.resetFilters(); });
    expect(mockPush).toHaveBeenCalledTimes(3);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /** Affiner ne doit pas ramener l'œil en haut ; changer de page, si. */
  it('ne défile pas en affinant, défile en paginant', () => {
    const { result } = monte('city=Dakar');
    act(() => { result.current.search({ bedrooms: 3 }); });
    expect(mockPush.mock.calls.at(-1)?.[1]).toEqual({ scroll: false });
    act(() => { result.current.setPage(2); });
    expect(mockPush.mock.calls.at(-1)?.[1]).toEqual({ scroll: true });
  });
});
