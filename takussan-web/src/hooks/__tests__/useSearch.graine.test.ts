import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * TCK-432 · AC5 — **la page ne repasse pas par le squelette après hydratation.**
 *
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE FICHIER MESURE, ET CE QU'IL REFUSE DE MESURER
 * ════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * L'AC dit : *« la page ne repasse pas par un état de squelette après hydratation quand le serveur
 * a déjà rendu les biens »*. Le squelette de `PropertiesDiscoveryPage` s'affiche sous une condition
 * unique et lisible — `loading && properties.length === 0`. La propriété à éprouver est donc, dans
 * le hook : **`loading` ne vaut jamais `true` sur un montage semé**.
 *
 * ⚠ La formulation compte. « Le hook finit par rendre les résultats » serait vert AUSSI sur le code
 * d'avant TCK-432 — c'est le comportement d'origine, effet réseau compris. Ce qui distingue les
 * deux, et rien d'autre, c'est **l'état du PREMIER commit** et **le nombre d'appels réseau**. Les
 * deux sont mesurés ici, séparément.
 */

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
import { clefDeRecherche, parametresDeRecherche } from '@/lib/recherche-publique';
import type { SearchResult } from '@/types/search';
import type { PropertyListItem } from '@/types/property';

function bien(id: number, slug: string): PropertyListItem {
  return { id, slug, title: `Bien ${id}` } as PropertyListItem;
}

const resultat = (ids: number[]): SearchResult =>
  ({
    data: ids.map((i) => bien(i, `bien-${i}`)),
    facets: {},
    meta: { current_page: 1, last_page: 1, per_page: 30, total: ids.length },
  }) as SearchResult;

/** La clef que le SERVEUR aurait calculée pour cette URL — même chaîne de fonctions que la page. */
const clefDe = (url: string) => clefDeRecherche(parametresDeRecherche(new URLSearchParams(url)));

function monteAvecGraine(url: string, urlSemee = url) {
  parametres = new URLSearchParams(url);
  return renderHook(() =>
    useSearch({ graine: { resultat: resultat([1, 2]), clef: clefDe(urlSemee) } }),
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(resultat([9]));
});

describe('TCK-432 · AC5 — un montage semé n’a rien à charger', () => {
  it('rend les résultats du serveur DÈS le premier commit, `loading` faux', () => {
    const { result } = monteAvecGraine('type=villa');

    // Aucun `waitFor` : c'est l'état du premier commit qui est éprouvé. Le mettre sous `waitFor`
    // laisserait passer un hook qui grisonne une fraction de seconde — précisément le défaut.
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.data.map((b) => b.id)).toEqual([1, 2]);
  });

  it('ne redemande PAS au réseau ce que le serveur vient de servir', async () => {
    monteAvecGraine('type=villa');

    // L'effet a déjà tourné à ce point (React le vide au montage sous `renderHook`).
    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());
  });

  it('les filtres lus de l’URL restent ceux de l’URL — la graine ne les remplace pas', () => {
    const { result } = monteAvecGraine('type=villa&bedrooms=3');

    expect(result.current.filters.type).toEqual(['villa']);
    expect(result.current.filters.bedrooms).toBe(3);
  });
});

describe('TCK-432 · AC5 — une graine PÉRIMÉE ne doit surtout pas être réutilisée', () => {
  /**
   * Le cas qui rend la clef indispensable. Sans elle, le hook réafficherait les villas du serveur
   * sous une puce « Appartement » : un écran qui ment, ce qui est pire qu'un écran qui charge.
   */
  it('recharge quand l’URL ne décrit plus la requête que le serveur a exécutée', async () => {
    parametres = new URLSearchParams('type=apartment');
    const { result } = renderHook(() =>
      useSearch({ graine: { resultat: resultat([1, 2]), clef: clefDe('type=villa') } }),
    );

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    expect(String(mockApiFetch.mock.calls[0][0])).toContain('type=apartment');
    await waitFor(() => expect(result.current.data?.data.map((b) => b.id)).toEqual([9]));
  });

  it('recharge à chaque changement d’URL SUIVANT — la graine ne vaut que pour le premier rendu', async () => {
    parametres = new URLSearchParams('type=villa');
    const { rerender } = renderHook(() =>
      useSearch({ graine: { resultat: resultat([1, 2]), clef: clefDe('type=villa') } }),
    );
    await waitFor(() => expect(mockApiFetch).not.toHaveBeenCalled());

    parametres = new URLSearchParams('type=house');
    rerender();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));

    // ⚠ Et un RETOUR à l'URL semée ne doit pas ressusciter la graine : elle est consommée.
    parametres = new URLSearchParams('type=villa');
    rerender();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
  });
});

describe('TCK-432 — sans graine, rien ne change', () => {
  it('le hook garde exactement son comportement d’avant : squelette puis appel', async () => {
    parametres = new URLSearchParams('type=villa');
    const { result } = renderHook(() => useSearch());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });
});
