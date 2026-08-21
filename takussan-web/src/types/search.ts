export type SuggestCity = {
  label: string;
  slug?: string;
  count: number;
};

export type SuggestNeighborhood = {
  label: string;
  city: string;
  slug?: string;
  count: number;
};

export type SuggestPropertyType = {
  label: string;
  value: string;
  count: number;
};

export type SuggestResponse = {
  data: {
    cities: SuggestCity[];
    neighborhoods: SuggestNeighborhood[];
    property_types: SuggestPropertyType[];
  };
};

export type ContractType = 'sale' | 'rent';
export type RentPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type SortValue = 'relevance' | 'price_asc' | 'price_desc' | 'created_desc';

export type Traducteur = (cle: string, valeurs?: Record<string, string | number>) => string;

/**
 * Les quatre espaces de noms next-intl dont un libellé de filtre a besoin.
 *
 * La table ci-dessous est un module : `useTranslations` n'y est pas appelable. Le patron du
 * dépôt (TCK-286) veut que la donnée porte une CLÉ et que le rendu la résolve — ici la « donnée »
 * est une fonction par filtre, à qui le rendu passe ses traducteurs.
 */
export type TraducteursDeFiltre = {
  /** `useTranslations('search')` — les libellés vivent sous `tags.*`. */
  readonly tags: Traducteur;
  /** `useTranslations('property.types')` */
  readonly types: Traducteur;
  /** `useTranslations('property.contractTypes')` */
  readonly contract: Traducteur;
  /** `useTranslations('property.rentPeriods')` */
  readonly periods: Traducteur;
};

type CleCommune<V> = {
  /**
   * Les paramètres d'URL que cette clé POSSÈDE, le premier étant celui qu'on écrit.
   *
   * ⚠ `q` en possède DEUX (`q` et `search`). C'était le correctif de TCK-335 à `removeFilter`,
   * écrit en dur dans le hook (`if (key === 'q') params.delete('search')`) : la puce était
   * irrémovable sur `/properties?search=villa`, qu'un lien externe ou hérité suffit à atteindre.
   * Sans ce champ, ce correctif resterait la seule liste de clés à vivre hors de la table —
   * exactement la forme de dette que TCK-340 ferme.
   */
  readonly params: readonly [string, ...string[]];
  /** Lit la valeur depuis l'URL, ou `undefined` si la clé n'y est pas (ou n'y est pas lisible). */
  lire(sp: URLSearchParams): V | undefined;
  /** Sérialise pour l'URL. `undefined` ou `''` = ne rien écrire. */
  ecrire(v: V): string | undefined;
};

/**
 * Une clé qui FILTRE : elle restreint le jeu de résultats, donc elle doit être visible et
 * retirable — d'où le libellé, obligatoire par le typage.
 */
export type CleFiltre<V> = CleCommune<V> & {
  readonly role: 'filtre';
  libelle(v: V, trads: TraducteursDeFiltre): string;
  /**
   * Clés multi-valuées : une puce par valeur, chacune retirable seule. `type` est la seule
   * aujourd'hui. La sous-clé est ce que `onRemoveFilter` reçoit en second argument.
   */
  eclater?(v: V): readonly { readonly sousCle: string; readonly valeur: V }[];
};

/**
 * Une clé de CONTRÔLE : elle pilote la requête sans rien restreindre (tri, pagination).
 *
 * ⚠ C'est une sortie de secours d'un mot, et elle est dangereuse : un filtre déclaré ici
 * devient actif, invisible et non retirable — PIRE que l'état d'avant TCK-340, où une clé
 * sans libellé rendait au moins sa valeur brute. Le typage ne peut pas l'empêcher (les deux
 * formes sont valides) : c'est `search-filters.parity.test.ts` qui la garde à l'exécution,
 * contre les règles PHP et contre une liste écrite à la main.
 */
export type CleControle<V> = CleCommune<V> & { readonly role: 'controle' };

export type CleDeRecherche<V> = CleFiltre<V> | CleControle<V>;

// ─── Petits lecteurs, au comportement IDENTIQUE à celui d'avant TCK-340 ──────────────────────

/** `''` est conservé tel quel : les consommateurs le traitent comme « absent » (`v !== ''`). */
function litTexte(sp: URLSearchParams, nom: string): string | undefined {
  return sp.get(nom) ?? undefined;
}

function litNombre(sp: URLSearchParams, nom: string): number | undefined {
  const v = sp.get(nom);
  return v ? Number(v) : undefined;
}

/** `true`/`false` si la valeur est reconnue, `undefined` sinon (paramètre absent ou illisible). */
export function booleenDUrl(brut: string | null): boolean | undefined {
  if (brut === 'true' || brut === '1') return true;
  if (brut === 'false' || brut === '0') return false;
  return undefined;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA table — TCK-340
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Elle remplace **douze** énumérations de clés de filtre dispersées dans le front (le ticket en
 * annonçait onze et en listait treize ; `criteriaToQueryString` n'en était pas une, elle est
 * entièrement générique). Sept étaient en accord PARFAIT depuis TCK-335 — c'est-à-dire qu'elles
 * n'avaient rien à corriger, seulement à ne plus pouvoir diverger. Les trois qui avaient
 * réellement dérivé sont `mapFilters`, `humaniseCriteria` et `suggestName`.
 *
 * `satisfies Record<string, CleDeRecherche<unknown>>` fait l'essentiel :
 * **ajouter une clé `role: 'filtre'` sans `libelle` est une erreur de compilation.**
 *
 * ⚠ La borne ne peut PAS être `CleDeRecherche<never>` : `lire()` rend `V | undefined`, donc
 * `V` y est covariant et `CleFiltre<string>` n'est pas assignable à `CleFiltre<never>` (TS2322).
 * `unknown` marche parce que la covariance de `lire()` y est satisfaite, et parce que `ecrire()`
 * et `libelle()` sont déclarées en syntaxe de MÉTHODE — bivariante — et non en propriété-flèche,
 * qui serait contravariante sous `strictFunctionTypes` et rejetterait la table entière.
 */
export const SEARCH_FILTER_KEYS = {
  q: {
    role: 'filtre',
    params: ['q', 'search'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'q') ?? litTexte(sp, 'search'),
    ecrire: (v: string) => v,
    libelle: (v: string) => `"${v}"`,
  },
  location: {
    role: 'filtre',
    params: ['location'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'location'),
    ecrire: (v: string) => v,
    libelle: (v: string, t: TraducteursDeFiltre) => t.tags('tags.quarter', { value: v }),
  },
  city: {
    role: 'filtre',
    params: ['city'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'city'),
    ecrire: (v: string) => v,
    libelle: (v: string) => v,
  },
  contract_type: {
    role: 'filtre',
    params: ['contract_type'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'contract_type') as ContractType | undefined,
    ecrire: (v: ContractType) => v,
    libelle: (v: ContractType, t: TraducteursDeFiltre) => t.contract(v === 'sale' ? 'sale' : 'rent'),
  },
  type: {
    role: 'filtre',
    params: ['type'],
    lire: (sp: URLSearchParams) => {
      const brut = litTexte(sp, 'type');
      return brut ? brut.split(',').filter(Boolean) : undefined;
    },
    ecrire: (v: string[]) => v.join(','),
    libelle: (v: string[], t: TraducteursDeFiltre) => v.map((x) => t.types(x)).join(', '),
    eclater: (v: string[]) => v.map((x) => ({ sousCle: x, valeur: [x] })),
  },
  rent_period: {
    role: 'filtre',
    params: ['rent_period'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'rent_period') as RentPeriod | undefined,
    ecrire: (v: RentPeriod) => v,
    libelle: (v: RentPeriod, t: TraducteursDeFiltre) => t.periods(v),
  },
  price_min: {
    role: 'filtre',
    params: ['price_min'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'price_min'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.priceMin', { value: Number(v).toLocaleString('fr-SN') }),
  },
  price_max: {
    role: 'filtre',
    params: ['price_max'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'price_max'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.priceMax', { value: Number(v).toLocaleString('fr-SN') }),
  },
  bedrooms: {
    role: 'filtre',
    params: ['bedrooms'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'bedrooms'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.bedrooms', { n: String(v) }),
  },
  bathrooms: {
    role: 'filtre',
    params: ['bathrooms'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'bathrooms'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.bathrooms', { n: String(v) }),
  },
  area_min: {
    role: 'filtre',
    params: ['area_min'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'area_min'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.areaMin', { value: String(v) }),
  },
  area_max: {
    role: 'filtre',
    params: ['area_max'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'area_max'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.areaMax', { value: String(v) }),
  },
  furnished: {
    role: 'filtre',
    params: ['furnished'],
    // TCK-335 — l'URL peut porter `1`/`0` aussi bien que `true`/`false` : le backend accepte
    // les deux depuis que `furnished` a cessé de rendre 422. Ne lire que `=== 'true'` faisait
    // afficher la puce « Non meublé » sur `?furnished=1`, une URL qui filtre POURTANT les biens
    // meublés — l'interface annonçait l'inverse de ce que le serveur appliquait.
    lire: (sp: URLSearchParams) => booleenDUrl(sp.get('furnished')),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: boolean, t: TraducteursDeFiltre) => t.tags(v ? 'tags.furnished' : 'tags.notFurnished'),
  },
  featured: {
    role: 'filtre',
    params: ['featured'],
    // `featured` est UNILATÉRAL côté serveur (aligné sur `PublicPropertyController::index()`) :
    // `featured=false` ne filtre rien. Le lire comme `false` ferait afficher une puce
    // « ★ En vedette » sur un résultat non filtré — la puce mentirait.
    lire: (sp: URLSearchParams) => (booleenDUrl(sp.get('featured')) === true ? true : undefined),
    ecrire: (v: number | boolean) => String(v),
    libelle: (_v: boolean, t: TraducteursDeFiltre) => t.tags('tags.featured'),
  },
  floor_number: {
    role: 'filtre',
    params: ['floor_number'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'floor_number'),
    ecrire: (v: number | boolean) => String(v),
    libelle: (v: number, t: TraducteursDeFiltre) =>
      Number(v) === 0 ? t.tags('tags.groundFloor') : t.tags('tags.floor', { n: String(v) }),
  },
  available_from: {
    role: 'filtre',
    params: ['available_from'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'available_from'),
    ecrire: (v: string) => v,
    libelle: (v: string, t: TraducteursDeFiltre) =>
      t.tags('tags.availableFrom', {
        date: new Date(String(v)).toLocaleDateString('fr-SN', {
          day: '2-digit', month: 'short', year: 'numeric',
        }),
      }),
  },
  tags: {
    role: 'filtre',
    params: ['tags'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'tags'),
    ecrire: (v: string) => v,
    libelle: (v: string, t: TraducteursDeFiltre) => t.tags('tags.tags', { value: v }),
  },
  sort: {
    role: 'controle',
    params: ['sort'],
    lire: (sp: URLSearchParams) => litTexte(sp, 'sort') as SortValue | undefined,
    ecrire: (v: SortValue) => v,
  },
  page: {
    role: 'controle',
    params: ['page'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'page'),
    ecrire: (v: number | boolean) => String(v),
  },
  per_page: {
    role: 'controle',
    params: ['per_page'],
    lire: (sp: URLSearchParams) => litNombre(sp, 'per_page'),
    ecrire: (v: number | boolean) => String(v),
  },
} satisfies Record<string, CleDeRecherche<unknown>>;

export type CleDeRechercheNom = keyof typeof SEARCH_FILTER_KEYS;

type ValeurDe<C> = C extends { lire(sp: URLSearchParams): infer V } ? Exclude<V, undefined> : never;

/**
 * DÉRIVÉ de la table, et non l'inverse — c'est le sens de la flèche qui fait tenir AC1.
 *
 * L'interface écrite à la main a vécu trois mois à côté de onze autres énumérations des mêmes
 * clés ; elle ne pouvait pas les tenir, et `searchFiltersSchema` avait déjà divergé en silence
 * (18 clés contre 20) sans qu'aucun consommateur ne puisse le signaler.
 */
export type SearchFilters = {
  -readonly [K in CleDeRechercheNom]?: ValeurDe<(typeof SEARCH_FILTER_KEYS)[K]>;
};

/** L'ordre de déclaration de la table, qui est aussi l'ordre des puces et des paramètres d'URL. */
export const CLES_DE_RECHERCHE = Object.keys(SEARCH_FILTER_KEYS) as CleDeRechercheNom[];

/**
 * La définition d'une clé, valeur EFFACÉE — la forme dont un consommateur qui itère a besoin.
 * Le typage précis reste dans la table ; l'assignabilité est prouvée par son `satisfies`.
 */
export function definitionDe(cle: CleDeRechercheNom): CleDeRecherche<unknown> {
  return SEARCH_FILTER_KEYS[cle] as CleDeRecherche<unknown>;
}

export function estControle(cle: CleDeRechercheNom): boolean {
  return SEARCH_FILTER_KEYS[cle].role === 'controle';
}

/** Les clés qui ne filtrent rien : ni comptées, ni affichées en puce, ni sauvegardées en critère. */
export const CLES_DE_CONTROLE: readonly CleDeRechercheNom[] = CLES_DE_RECHERCHE.filter(estControle);

export type PuceDeFiltre = {
  readonly cle: CleDeRechercheNom;
  readonly sousCle?: string;
  readonly libelle: string;
};

/**
 * Les libellés des filtres actifs — **l'unique** endroit du front qui les calcule.
 *
 * Sert les puces de `SearchToolbar` ET le résumé d'une recherche sauvegardée
 * (`SavedSearchesList`), qui en tenait sa propre version : elle ne connaissait que six clés sur
 * dix-sept, rendait `furnished`, `featured`, `tags`, `location`, `rent_period`, `floor_number`
 * et `available_from` INVISIBLES dans le résumé, et écrivait « Vente » / « ch. » / « surface »
 * en français dur, hors next-intl (principe 5).
 */
export function puceDeChaqueFiltreActif(
  filtres: SearchFilters,
  trads: TraducteursDeFiltre,
): PuceDeFiltre[] {
  const puces: PuceDeFiltre[] = [];
  for (const cle of Object.keys(filtres) as CleDeRechercheNom[]) {
    const def = SEARCH_FILTER_KEYS[cle] as CleDeRecherche<unknown> | undefined;
    // Une clé inconnue de la table (critère sauvegardé d'une version antérieure, par exemple)
    // n'a pas de libellé sûr : on ne l'invente pas.
    if (!def || def.role !== 'filtre') continue;
    const valeur = filtres[cle];
    if (valeur === undefined || valeur === null || valeur === '') continue;
    if (Array.isArray(valeur) && valeur.length === 0) continue;
    const morceaux = def.eclater
      ? def.eclater(valeur)
      : [{ sousCle: undefined as string | undefined, valeur }];
    for (const m of morceaux) {
      puces.push({ cle, sousCle: m.sousCle, libelle: def.libelle(m.valeur, trads) });
    }
  }
  return puces;
}

export interface Facets {
  locations: Record<string, number>;
  bedrooms: Record<string, number>;
  types: Record<string, number>;
}

/**
 * Les deux régimes de la recherche publique — {@link file://../../../docs/adr/0020-recherche-publique-conjonctive-avec-repli-nomme.md ADR-0020}.
 *
 * - `all` : régime nominal, un bien ne sort que s'il porte TOUS les termes utiles.
 * - `widened` : la conjonction a rendu 0, la requête a été rejouée en relâchant des termes.
 *   `data`, `facets` et `meta` décrivent alors le résultat ÉLARGI — c'est-à-dire des biens qui
 *   ne répondent pas à la demande écrite.
 */
export type RegimeDeRecherche = 'all' | 'widened';

/**
 * Le bloc `search` de `GET /api/public/properties/search` (TCK-338).
 *
 * ⚠ **Optionnel dans {@link SearchResult}, et c'est délibéré.** Le champ est servi par le back
 * depuis TCK-338, mais la production appelle `api.takussan.com`, qui rend 404 (TCK-332) : le
 * front peut parfaitement recevoir une réponse d'un déploiement antérieur. Un type non optionnel
 * mentirait au compilateur, et l'absence se lirait alors comme un `strategy` `undefined` que
 * personne n'a testé. Ici elle se lit comme « rien à dire », qui est le bon défaut.
 */
export interface BlocDeRecherche {
  strategy: RegimeDeRecherche;
  /**
   * Les termes dont la SONDE SOLO rend 0 — pas « les termes relâchés », que Meilisearch ne rend
   * nulle part. Vide quand chaque terme existe séparément mais que leur intersection est vide :
   * désigner l'un d'eux serait inventer un coupable (ADR-0020).
   */
  terms_unmatched: string[];
  /** Écho de `meta.total` sous `widened`, `null` sous `all`. */
  widened_total: number | null;
}

export interface SearchResult {
  data: import('./property').PropertyListItem[];
  facets: Facets;
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
  search?: BlocDeRecherche;
}

/**
 * Ce que l'ÉCRAN a besoin de savoir du repli, une fois le bloc d'API normalisé.
 *
 * `null` = il n'y a rien à dire, et c'est le cas de l'écrasante majorité des requêtes.
 */
export type RepliDeRecherche = {
  /** Vide = « aucun bien ne réunit tous vos mots », non vide = ces termes-là ne matchent rien. */
  readonly termesSansResultat: readonly string[];
  /** Le nombre de biens réellement affichés sous le régime élargi. */
  readonly totalElargi: number;
};

/**
 * Normalise le bloc `search` en ce que l'écran doit dire — ou en `null`.
 *
 * Trois refus délibérés, et chacun évite une phrase fausse :
 *
 * 1. **`strategy !== 'widened'` ⇒ `null`**, même si `terms_unmatched` n'était pas vide. Sous le
 *    régime nominal les biens affichés portent TOUS les termes : il n'y a rien à relativiser, et
 *    afficher un avertissement au-dessus d'un résultat exact serait un mensonge de plus.
 * 2. **Les entrées non-chaînes ou vides sont écartées.** `apiFetch` ne valide rien : le type
 *    ci-dessus est une promesse, pas une garantie d'exécution, et une puce « Retirer «  » »
 *    serait irréparable pour l'utilisateur.
 * 3. **Le compte affiché sort du bloc, pas de `data.length`.** `data` est plafonné par
 *    `per_page` : compter les cartes rendrait « 30 biens proches » sur un repli qui en a 63.
 */
export function repliDeRecherche(result: SearchResult | null | undefined): RepliDeRecherche | null {
  const bloc = result?.search;
  if (!bloc || bloc.strategy !== 'widened') return null;

  const termes = Array.isArray(bloc.terms_unmatched)
    ? bloc.terms_unmatched.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : [];

  // `widened_total` est l'écho de `meta.total` PAR CONSTRUCTION (ADR-0020) : le repli sur
  // `meta.total` ne choisit donc pas entre deux comptes, il lit le même par l'autre chemin.
  const totalElargi = typeof bloc.widened_total === 'number'
    ? bloc.widened_total
    : (result?.meta?.total ?? 0);

  return { termesSansResultat: termes, totalElargi };
}

/** Minuscule + accents pliés — même normalisation que `PropertySearchService::fold()`. */
function plier(valeur: string): string {
  return valeur.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * La requête privée d'UN terme — le geste « retirer le mot qui ne correspond à rien ».
 *
 * Découpe sur les mêmes frontières que le back (`/[^\p{L}\p{N}]+/u`, cf. `usefulTerms()`), pour
 * que « villa, Saly » compte bien deux termes et non un seul. La comparaison est faite sur la
 * forme PLIÉE : le back rend le terme tel que l'utilisateur l'a écrit, mais la sonde, elle, a
 * porté sur la forme normalisée — retirer « Saly » doit donc retirer « saly » et « SALY ».
 *
 * Rend une chaîne vide quand il ne reste plus rien : l'appelant écrit alors une URL sans `q`,
 * ce que `filtersToParams` fait déjà pour toute valeur vide.
 *
 * ⚠ La ponctuation d'origine n'est PAS conservée (« villa, Saly » → « villa ») : les séparateurs
 * ne sont pas des termes, et les recoller exactement demanderait de deviner lequel appartenait au
 * mot supprimé.
 */
export function retirerTermeDeLaRequete(requete: string, terme: string): string {
  const cible = plier(terme.trim());
  const mots = requete.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (cible === '') return mots.join(' ');
  return mots.filter((mot) => plier(mot) !== cible).join(' ');
}
