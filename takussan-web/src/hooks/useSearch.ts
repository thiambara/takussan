'use client';
import { useReducer, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import {
  CLES_DE_RECHERCHE,
  CLES_DE_CONTROLE,
  SEARCH_FILTER_KEYS,
  definitionDe,
  repliDeRecherche,
  retirerTermeDeLaRequete,
  type CleDeRechercheNom,
  type SearchFilters,
  type SearchResult,
} from '@/types/search';

type State =
  | { status: 'idle' }
  | { status: 'loading'; prev: SearchResult | null }
  | { status: 'success'; result: SearchResult }
  | { status: 'error'; erreur: Error; prev: SearchResult | null };

type Action =
  | { type: 'LOADING'; prev: SearchResult | null }
  | { type: 'SUCCESS'; result: SearchResult }
  | { type: 'ERROR'; erreur: Error; prev: SearchResult | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING': return { status: 'loading', prev: action.prev };
    case 'SUCCESS': return { status: 'success', result: action.result };
    case 'ERROR':   return { status: 'error', erreur: action.erreur, prev: action.prev };
  }
}

// ─── Serialisation ──────────────────────────────────────────────────────────

/**
 * TCK-340 — sérialisation et lecture d'URL passent désormais par `SEARCH_FILTER_KEYS`.
 *
 * C'étaient DEUX énumérations distinctes des mêmes vingt clés, à quinze lignes l'une de l'autre,
 * et rien ne pouvait dire laquelle avait raison si elles divergeaient : un filtre écrit par
 * `filtersToParams` mais absent de `filtersFromSearchParams` disparaît au rechargement de la page,
 * sans erreur ni trace.
 */
export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const cle of CLES_DE_RECHERCHE) {
    const valeur = filters[cle];
    if (valeur === undefined || valeur === '') continue;
    const def = definitionDe(cle);
    const brut = def.ecrire(valeur);
    // `type: []` sérialise en chaîne vide : le filtre n'existe pas, on n'écrit rien.
    if (brut === undefined || brut === '') continue;
    params.set(def.params[0], brut);
  }
  return params;
}

export function filtersFromSearchParams(sp: URLSearchParams): SearchFilters {
  const filtres: Record<string, unknown> = {};
  for (const cle of CLES_DE_RECHERCHE) {
    const valeur = definitionDe(cle).lire(sp);
    if (valeur !== undefined) filtres[cle] = valeur;
  }
  return filtres as SearchFilters;
}

// ─── Count active filters (excluding sort, page) ────────────────────────────

/**
 * TCK-340 — dérivé de la table, plus écrit à la main.
 *
 * `SearchToolbar` en tenait une copie mot pour mot (`HIDDEN_FROM_TAGS`) : deux listes qui doivent
 * TOUJOURS coïncider, puisqu'un filtre compté sans puce est un filtre qu'on ne peut pas retirer.
 */
export const IGNORED_KEYS: readonly CleDeRechercheNom[] = CLES_DE_CONTROLE;

export function countActiveFilters(filters: SearchFilters): number {
  return (Object.keys(filters) as CleDeRechercheNom[])
    .filter(k => SEARCH_FILTER_KEYS[k]?.role === 'filtre' && filters[k] !== undefined && filters[k] !== '')
    .length;
}

/** Comment le changement s'inscrit dans l'historique du navigateur. */
export type Historique = 'push' | 'replace';

export type OptionsNavigation = {
  /** Défaut : `push`. Les commits de champ continu passent `replace` — cf. `search()`. */
  historique?: Historique;
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSearch() {
  const router   = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  // TCK-316 — `searchParams.toString()` était un APPEL dans le tableau de
  // dépendances, ce que React ne sait pas comparer (`react-hooks/use-memo`), et
  // un `eslint-disable-next-line` masquait le tout. La chaîne est hoistée : elle
  // est une dépendance simple, stable, et `currentFilters` en dérive — donc les
  // deux `useCallback` ci-dessous n'ont plus besoin de dérogation.
  const searchParamsKey = searchParams.toString();
  const currentFilters = useMemo(
    () => filtersFromSearchParams(new URLSearchParams(searchParamsKey)),
    [searchParamsKey],
  );

  /**
   * TCK-335, étape 5 — `push` ou `replace`, et le critère est le GESTE, pas le filtre.
   *
   * Tout passait par `router.replace`, si bien que l'historique ne grandissait jamais :
   * un visiteur qui posait cinq filtres puis appuyait une fois sur Précédent ne revenait
   * pas au filtre précédent, **il quittait la recherche** (mesuré : `history.length`
   * inchangé à 2 après la saisie d'un filtre).
   *
   * Mais `push` partout serait PIRE que l'état d'origine, et c'est pour ça que cette
   * étape dépendait de l'anti-rebond : sans lui, frapper « Dakar » empilerait cinq
   * entrées et « 150000 » six — cinq Précédent pour défaire un mot.
   *
   * D'où la ligne de partage :
   *
   * | geste | exemples | méthode |
   * |---|---|---|
   * | **discret** — un geste = une intention | puce, bascule, tri, `per_page`, pagination, retrait de filtre, réinitialisation | `push` |
   * | **continu** — la valeur transite par des états intermédiaires | les quatre champs texte et les quatre bornes numériques du panneau | `replace` |
   *
   * `SearchAutocomplete` employait déjà `router.push` pour entrer dans les résultats : la
   * convention implicite du dépôt était donc *entrer empile, affiner écrase*. On la rend
   * explicite plutôt que d'en inventer une autre.
   */
  const naviguer = useCallback((url: string, historique: Historique, defiler = false) => {
    if (historique === 'push') {
      router.push(url, { scroll: defiler });
    } else {
      router.replace(url, { scroll: defiler });
    }
  }, [router]);

  const search = useCallback((
    filters: Partial<SearchFilters>,
    options: OptionsNavigation = {},
  ) => {
    const merged = { ...currentFilters, ...filters, page: 1 };
    const qs = filtersToParams(merged).toString();
    // `scroll: false` : affiner une recherche ne doit pas ramener l'œil en haut de page.
    naviguer(`${pathname}${qs ? '?' + qs : ''}`, options.historique ?? 'push');
  }, [naviguer, pathname, currentFilters]);

  const setPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    // Changer de page, EN REVANCHE, défile — la page suivante commence en haut.
    naviguer(`${pathname}?${params.toString()}`, 'push', true);
  }, [naviguer, pathname, searchParams]);

  const resetFilters = useCallback(() => {
    naviguer(pathname, 'push');
  }, [naviguer, pathname]);

  const removeFilter = useCallback((key: keyof SearchFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    // TCK-335 — `q` alimente la MÊME puce depuis `q` ET depuis `search` : n'en retirer qu'un
    // rendait la puce irrémovable sur `/properties?search=villa`, qu'un lien externe ou hérité
    // suffit à atteindre. TCK-340 — ce cas particulier était écrit ici en dur (`if (key === 'q')`),
    // seule liste de clés à vivre hors de la table ; il est désormais porté par `params`.
    for (const nom of definitionDe(key).params) params.delete(nom);
    params.set('page', '1');
    naviguer(`${pathname}?${params.toString()}`, 'push');
  }, [naviguer, pathname, searchParams]);

  /**
   * TCK-338 — retirer UN terme de la requête texte, en gardant tout le reste.
   *
   * C'est le geste que le repli conjonctif rend nécessaire : sur `q=villa Saly`, le back a dû
   * relâcher « Saly » pour rendre quelque chose, et l'écran l'annonce. Sans ce geste, l'unique
   * issue serait de retirer la recherche ENTIÈRE (`removeFilter('q')`) — l'utilisateur perdrait
   * « villa », c'est-à-dire la moitié de sa demande qui, elle, marchait.
   *
   * Passe par `search()` — donc `push`, comme tout geste discret (cf. son docblock) : le retour
   * arrière ramène la requête complète, et c'est ce qui rend le geste sans risque.
   */
  const retirerTerme = useCallback((terme: string) => {
    const restant = retirerTermeDeLaRequete(currentFilters.q ?? '', terme);
    // `''` n'est pas écrit par `filtersToParams` : `q` disparaît de l'URL, et l'alias hérité
    // `search=` avec lui, puisque l'URL est reconstruite depuis les filtres et non modifiée.
    search({ q: restant });
  }, [search, currentFilters.q]);

  // Fetch whenever URL params change
  useEffect(() => {
    const qs = searchParams.toString();
    const prev = state.status === 'success' ? state.result
               : state.status === 'loading' ? state.prev
               : state.status === 'error'   ? state.prev
               : null;

    dispatch({ type: 'LOADING', prev });

    const apiParams = new URLSearchParams(qs);
    if (!apiParams.has('q') && apiParams.has('search')) {
      apiParams.set('q', apiParams.get('search') ?? '');
    }
    if (!apiParams.has('per_page')) apiParams.set('per_page', '30');

    let cancelled = false;
    apiFetch<SearchResult>(`/public/properties/search?${apiParams.toString()}`)
      .then(result => { if (!cancelled) dispatch({ type: 'SUCCESS', result }); })
      .catch((erreur: unknown) => {
        if (cancelled) return;
        const erreurNormalisee = erreur instanceof Error ? erreur : new Error(String(erreur));
        // TCK-335 — sur un 422, on JETTE le résultat précédent. Le garder afficherait
        // les anciennes cartes et l'ancien total comme s'ils étaient courants, sous une
        // puce de filtre qui n'a rien filtré : le mensonge est alors plus crédible que
        // « 0 bien trouvé ». Un 5xx ou une panne réseau, eux, n'invalident pas ce qui
        // était juste il y a une seconde — on le garde.
        const filtreInvalide = erreurNormalisee instanceof ApiError && erreurNormalisee.status === 422;
        dispatch({ type: 'ERROR', erreur: erreurNormalisee, prev: filtreInvalide ? null : prev });
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const result = state.status === 'success' ? state.result
               : (state.status === 'loading' || state.status === 'error') ? state.prev ?? null
               : null;

  return {
    data:           result,
    loading:        state.status === 'loading' || state.status === 'idle',
    // TCK-335 — l'erreur elle-même, plus un booléen : c'est ce qui permet à la page de
    // distinguer « ce filtre n'est pas valide » (422, réparable par l'utilisateur) d'une
    // panne (5xx, réseau), et de nommer le filtre en cause via `validationErrors`.
    error:          state.status === 'error' ? state.erreur : null,
    filters:        currentFilters,
    activeCount:    countActiveFilters(currentFilters),
    // TCK-338 — ce que le bloc `search` de la réponse oblige l'écran à dire, ou `null`.
    // Il arrivait dans le JSON et mourait là : `SearchResult` ne le déclarait pas.
    repli:          repliDeRecherche(result),
    search,
    setPage,
    resetFilters,
    removeFilter,
    retirerTerme,
  };
}
