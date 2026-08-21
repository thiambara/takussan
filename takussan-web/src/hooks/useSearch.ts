'use client';
import { useReducer, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { SearchFilters, SearchResult } from '@/types/search';

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

function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries: Array<[string, string | number | boolean | undefined]> = [
    ['q',              filters.q],
    ['location',       filters.location],
    ['city',           filters.city],
    ['contract_type',  filters.contract_type],
    ['rent_period',    filters.rent_period],
    ['price_min',      filters.price_min],
    ['price_max',      filters.price_max],
    ['bedrooms',       filters.bedrooms],
    ['bathrooms',      filters.bathrooms],
    ['area_min',       filters.area_min],
    ['area_max',       filters.area_max],
    ['furnished',      filters.furnished],
    ['featured',       filters.featured],
    ['floor_number',   filters.floor_number],
    ['available_from', filters.available_from],
    ['tags',           filters.tags],
    ['sort',           filters.sort],
    ['page',           filters.page],
    ['per_page',       filters.per_page],
  ];
  for (const [k, v] of entries) {
    if (v !== undefined && v !== '') params.set(k, String(v));
  }
  if (filters.type?.length) params.set('type', filters.type.join(','));
  return params;
}

/** `true`/`false` si la valeur est reconnue, `undefined` sinon (paramètre absent ou illisible). */
function booleenDUrl(brut: string | null): boolean | undefined {
  if (brut === 'true' || brut === '1') return true;
  if (brut === 'false' || brut === '0') return false;
  return undefined;
}

function filtersFromSearchParams(sp: URLSearchParams): SearchFilters {
  const n = (key: string) => { const v = sp.get(key); return v ? Number(v) : undefined; };
  const s = (key: string) => sp.get(key) ?? undefined;
  return {
    q:             s('q') ?? s('search'),
    location:      s('location'),
    city:          s('city'),
    contract_type: s('contract_type') as SearchFilters['contract_type'],
    type:          s('type') ? s('type')!.split(',').filter(Boolean) : undefined,
    rent_period:   s('rent_period') as SearchFilters['rent_period'],
    price_min:     n('price_min'),
    price_max:     n('price_max'),
    bedrooms:      n('bedrooms'),
    bathrooms:     n('bathrooms'),
    area_min:      n('area_min'),
    area_max:      n('area_max'),
    // TCK-335 — l'URL peut porter `1`/`0` aussi bien que `true`/`false` : le backend
    // accepte les deux depuis que `furnished` a cessé de rendre 422. Ne lire que
    // `=== 'true'` faisait afficher la puce « Non meublé » sur `?furnished=1`, une URL
    // qui filtre POURTANT les biens meublés — l'interface annonçait l'inverse de ce
    // que le serveur appliquait.
    furnished:     booleenDUrl(sp.get('furnished')),
    // `featured` est UNILATÉRAL côté serveur (aligné sur `PublicPropertyController::index()`) :
    // `featured=false` ne filtre rien. Le lire comme `false` ferait afficher une puce
    // « ★ En vedette » sur un résultat non filtré — la puce mentirait.
    featured:      booleenDUrl(sp.get('featured')) === true ? true : undefined,
    floor_number:  n('floor_number'),
    available_from: s('available_from'),
    tags:          s('tags'),
    sort:          s('sort') as SearchFilters['sort'],
    page:          n('page'),
    per_page:      n('per_page'),
  };
}

// ─── Count active filters (excluding sort, page) ────────────────────────────

const IGNORED_KEYS: (keyof SearchFilters)[] = ['sort', 'page', 'per_page'];

export function countActiveFilters(filters: SearchFilters): number {
  return (Object.keys(filters) as (keyof SearchFilters)[])
    .filter(k => !IGNORED_KEYS.includes(k) && filters[k] !== undefined && filters[k] !== '')
    .length;
}

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

  const search = useCallback((filters: Partial<SearchFilters>) => {
    const merged = { ...currentFilters, ...filters, page: 1 };
    const qs = filtersToParams(merged).toString();
    router.replace(`${pathname}${qs ? '?' + qs : ''}`);
  }, [router, pathname, currentFilters]);

  const setPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  const resetFilters = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  const removeFilter = useCallback((key: keyof SearchFilters) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(String(key));
    // TCK-335 — `filtersFromSearchParams` lit `q ?? search` : les deux alimentent la
    // MÊME puce. N'en retirer qu'un rendait la puce irrémovable sur `/properties?search=villa`
    // — un lien externe ou hérité suffit à l'atteindre.
    if (key === 'q') params.delete('search');
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

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
    search,
    setPage,
    resetFilters,
    removeFilter,
  };
}
