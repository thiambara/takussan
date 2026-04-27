# TCK-107 — Autocomplétion recherche (plan d'implémentation)

## Contexte

La home (TCK-038) et la page résultats `/properties` (TCK-039) sont en place ; les biens sont indexés via Spatie + Scout (TCK-024) avec filtres URL-synced (`?city=`, `?type=`, etc.). Aujourd'hui, un visiteur doit deviner les villes/quartiers/types — il n'y a aucune assistance à la saisie. L'objectif TCK-107 : dropdown d'autocomplétion qui, dès le 1er caractère, suggère **villes**, **quartiers** et **types de bien** groupés, classés par nombre de biens publiés.

**Choix de scope confirmés via exploration** :

- **Tolérance casse + accents cross-DB** : la connexion par défaut est **SQLite** (`config/database.php:default = sqlite`). L'extension `unaccent` (Postgres) mentionnée dans le ticket n'est donc pas portable. On utilise une stratégie **mémoire + Redis** : précalcul de la liste des cities/neighborhoods/types (cardinalité faible : Sénégal = quelques dizaines de villes), cache `search:suggest:base:{locale}` TTL 5min, filtre prefix-match en PHP avec `Str::ascii(Str::lower(...))`. Aucune extension DB requise, aucune migration, aucun nouvel index.
- **Source `cities` / `neighborhoods`** : table polymorphique `addresses` (jamais directement sur `properties` — la colonne city/neighborhood n'existe pas sur `properties`). Jointure `addresses.addressable_id = properties.id AND addressable_type = 'App\Models\Property'` filtrée sur `properties.status = 'published'`. L'index `morphs('addressable')` existant suffit.
- **Source `property_types`** : enum `PropertyType` (16 cases, value EN). Labels traduits chargés via `trans('properties.type', [], $locale)` (déjà rempli en fr/en/wo). Match prefix sur le **label localisé** (sinon "appart" en français ne matcherait pas `apartment`).
- **`limit` par groupe** : le ticket dit "limit global max 30, default 10" — interprétation pragmatique : **le `limit` s'applique par groupe** (chaque groupe peut retourner jusqu'à `limit` éléments). Cela évite l'arbitraire d'un quota inter-groupe.
- **Endpoint public** : `routes/api/search.php` existe mais protégé par `auth:sanctum` — on ajoute la route hors du groupe auth (ou en haut de fichier). URL canonique du ticket = `/api/search/suggest`.
- **Combobox frontend** : `@base-ui/react ^1.4` (déjà installé) — composant `Combobox` ARIA-correct, clavier inclus. Pas de nouvelle dépendance.
- **Intégration Hero / barre globale** : la home (`app/(public)/page.tsx`) et le layout dashboard (`(dashboard)`) existent ; on insère le composant à 2 endroits.
- **Pas d'invalidation explicite** : TTL 5min, dataset peu volatil (publication d'un bien n'est pas perçue comme "instant" sur l'autocomplete).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js 16, App Router)                              │
│                                                                 │
│  app/(public)/page.tsx ─┐                                       │
│  app/(dashboard)/layout.tsx ─┴─► <SearchAutocomplete />         │
│                                  ├─ Base UI Combobox            │
│                                  ├─ useSuggest(q)               │
│                                  │   ├─ debounce 150 ms         │
│                                  │   ├─ AbortController         │
│                                  │   └─ useApiQuery (TanStack)  │
│                                  └─ groupes Villes/Quartiers/   │
│                                     Types + highlight + count   │
│                                       │                         │
│                                       ▼ click/Enter             │
│                                  router.push('/properties?city=…│
│                                              &type=…&neighborhood│
└─────────────────────────────────────────────────────────────────┘
                                       │
                          GET /api/search/suggest?q=Dak&limit=10
                                       │
┌──────────────────────────────────────▼──────────────────────────┐
│  BACKEND (Laravel 13)                                           │
│                                                                 │
│  routes/api/search.php (hors auth)                              │
│   └─ GET /search/suggest [throttle:60,1] ─► SuggestController   │
│                                              │                  │
│                                              ▼                  │
│                                       SuggestRequest            │
│                                       (q min:1 max:50,          │
│                                        limit int max:30)        │
│                                              │                  │
│                                              ▼                  │
│                              SuggestService::resolve($q,$limit) │
│                              ├─ getBase($locale) [Cache::remember│
│                              │   TTL 300, key = base:{locale}]  │
│                              │   ├─ resolveCities()             │
│                              │   ├─ resolveNeighborhoods()      │
│                              │   └─ resolveTypes($locale)       │
│                              └─ filterPrefix($base, $q, $limit) │
│                                  (en mémoire, Str::ascii lower) │
│                                              │                  │
│                                              ▼                  │
│                              SuggestResource (groupé JSON)      │
│                              + Cache-Control: public, max-age=60│
└─────────────────────────────────────────────────────────────────┘
```

---

## Fichiers critiques (existants à modifier ou référencer)

| Fichier | Rôle dans le plan |
|---|---|
| `takussan-api/routes/api/search.php` | Ajout route `GET /search/suggest` hors du groupe `auth:sanctum`, avec `throttle:60,1` |
| `takussan-api/app/Http/Controllers/Api/SearchMessageController.php` | **Référence** du pattern single-action `__invoke` (FormRequest → Service → JsonResponse) — à dupliquer |
| `takussan-api/app/Http/Requests/Search/SearchQueryRequest.php` | **Référence** du pattern FormRequest dédié recherche |
| `takussan-api/app/Services/Search/MessageSearchService.php` | **Référence** du pattern Service injecté |
| `takussan-api/app/Models/Property.php:148-162` | Scope `public()` — **réutilisé** pour filtrer status = published dans `SuggestService` |
| `takussan-api/app/Models/Address.php` | Modèle polymorphique source des cities/neighborhoods (lecture seule, pas de modif) |
| `takussan-api/app/Models/Enums/PropertyType.php` | Enum 16 cases — **lecture seule** (les labels viennent de `lang/{locale}/properties.php`) |
| `takussan-api/lang/fr/properties.php` (+ en, wo) | `type` array — labels traduits utilisés pour le match côté backend |
| `takussan-api/config/database.php` | Vérification : `default = sqlite` — confirme le choix de stratégie cross-DB |
| `takussan-api/config/cache.php` | `default = redis` — `Cache::remember` utilise Redis |
| `takussan-web/src/lib/api.ts` | `apiFetch` + `buildQueryString` — réutilisé tel quel |
| `takussan-web/src/hooks/useApiQuery.ts` | Hook TanStack Query — réutilisé pour `useSuggest` |
| `takussan-web/src/app/(public)/page.tsx` | Home — **point d'insertion** du composant dans le Hero |
| `takussan-web/src/app/(dashboard)/layout.tsx` | Layout authentifié — **point d'insertion** dans la navbar |
| `takussan-web/src/messages/fr.json` (+ en, wo) | Ajout namespace `search.suggest.*` (groupes + états empty/error) |
| `takussan-web/package.json` | Vérifier `@base-ui/react ^1.4` (déjà présent) — pas d'ajout |
| `docs/backlog/INDEX.md` | Bascule TCK-107 `todo → review` à l'ouverture de la PR (target `dev` cf. mémoire utilisateur) |

---

## Nouveaux fichiers à créer

### Backend — couche HTTP

- `takussan-api/app/Http/Controllers/Api/Search/SuggestController.php`
  - Single-action `__invoke(SuggestRequest $request, SuggestService $service): JsonResponse`
  - Lit `q`, `limit` validés ; lit la locale courante (`app()->getLocale()`)
  - Appelle `$service->resolve($q, $limit, $locale)`
  - Renvoie `response()->json(['data' => $payload])->header('Cache-Control', 'public, max-age=60')`
  - Si `q` vide → renvoie `['data' => ['cities' => [], 'neighborhoods' => [], 'property_types' => []]]` (status 200, pas d'erreur — contrainte ticket)

- `takussan-api/app/Http/Requests/Search/SuggestRequest.php`
  - `authorize(): bool { return true; }` (endpoint public)
  - `rules(): array` :
    ```
    'q' => ['nullable', 'string', 'max:50'],
    'limit' => ['nullable', 'integer', 'min:1', 'max:30'],
    ```
  - `validated()` : retourne avec defaults (`q = ''`, `limit = 10`)

- `takussan-api/app/Http/Resources/Search/SuggestResource.php` (optionnel — peut être inline dans le controller pour simplicité)
  - Si on garde : structure `['cities' => [...], 'neighborhoods' => [...], 'property_types' => [...]]` ; chaque élément `{label, slug?, city?, value?, count}`.

### Backend — couche Service

- `takussan-api/app/Services/Search/SuggestService.php`
  - Constructeur : `__construct(private CacheRepository $cache)` (Laravel `Illuminate\Contracts\Cache\Repository`)
  - **Méthode publique** :
    ```php
    public function resolve(string $q, int $limit, string $locale): array
    ```
    1. Si `q === ''` → return groupes vides
    2. `$base = $this->getBase($locale);` (cache 5 min)
    3. `$normalized = $this->normalize($q);`
    4. Filtre chaque groupe par prefix-match sur `normalized_label`
    5. Tri par `count` desc, puis `label` asc
    6. Slice à `$limit` par groupe
    7. Retourne `['cities' => …, 'neighborhoods' => …, 'property_types' => …]`
  - **Méthode privée `getBase(string $locale): array`** :
    - Cache::remember "search:suggest:base:{locale}" 300s :
      - `cities` : `Address::query()->whereHasMorph('addressable', Property::class, fn ($q) => $q->where('status', PropertyStatus::Published))->whereNotNull('city')->groupBy('city')->select('city as label', DB::raw('count(*) as count'))->orderByDesc('count')->orderBy('city')->limit(500)->get()` (limit 500 pour cap dur ; au Sénégal cardinalité réelle < 100)
      - `neighborhoods` : idem, mais sur `neighborhood`, projeter aussi `city` via group composite `(neighborhood, city)`
      - `property_types` : `Property::query()->where('status', PropertyStatus::Published)->groupBy('type')->select('type as value', DB::raw('count(*) as count'))->get()` ; pour chaque, attacher `label = trans("properties.type.{$value}", [], $locale)`
    - Pour chaque entrée, ajouter `normalized_label = Str::ascii(Str::lower($label))` (clé interne)
  - **Méthode privée `normalize(string $s): string`** : `Str::ascii(Str::lower(trim($s)))`
  - **Méthode privée `filterPrefix(array $rows, string $needle, int $limit): array`** : `array_values(array_filter(...))->take($limit)` ; supprime la clé interne `normalized_label` du résultat final

### Backend — config / route

- Modification `routes/api/search.php` :
  ```php
  Route::get('search/suggest', SuggestController::class)
      ->middleware('throttle:60,1')
      ->name('search.suggest');
  ```
  Insérée **avant** le groupe `auth:sanctum` (donc publique).

### Backend — tests

- `takussan-api/tests/Feature/Api/Search/SearchSuggestTest.php` — 8 tests :
  1. `test_returns_cities_matching_prefix` (AC1) — seed 3 properties published à Dakar → `?q=da` retourne `cities[0].label == 'Dakar'`, `count == 3`
  2. `test_case_and_accent_insensitive` (AC2) — seed property city `Saint-Louis` → `?q=saint-l` et `?q=SAINT` et `?q=saint-louis` matchent identiquement
  3. `test_excludes_draft_properties` (AC3) — 2 properties à Thiès, 1 published / 1 draft → count = 1, pas 2
  4. `test_neighborhoods_grouped_with_city_context` — seed 2 quartiers Almadies/Mermoz → réponse `neighborhoods[].city` présent
  5. `test_property_types_use_translated_labels_per_locale` — header `Accept-Language: fr` → `?q=app` matche `Appartement` (value `apartment`), retourne `{label: "Appartement", value: "apartment"}` ; `Accept-Language: en` → `?q=app` matche `Apartment`
  6. `test_empty_query_returns_empty_groups` — `?q=` → `200` avec data vide (contrainte ticket "min 1 caractère")
  7. `test_rate_limit_returns_429_after_60_requests` (AC5) — boucle 61 GET → dernier = 429 (utilise `RateLimiter::hit` ou bypass via `withoutMiddleware` désactivé)
  8. `test_cache_control_header_set_to_60_seconds` — assert `Cache-Control: public, max-age=60`

- `takussan-api/tests/Unit/Services/Search/SuggestServiceTest.php` — 4 tests :
  1. `test_normalize_strips_accents_and_lowercases`
  2. `test_filter_prefix_sorts_by_count_then_alpha`
  3. `test_filter_prefix_respects_limit_per_group`
  4. `test_get_base_caches_per_locale` (mock Cache::remember, vérifier 2 appels avec locales différentes → 2 keys distinctes)

### Frontend — composant et hook

- `takussan-web/src/components/search/SearchAutocomplete.tsx`
  - Composant client (`'use client'`)
  - Props : `placeholder?: string`, `variant?: 'hero' | 'navbar'`, `className?: string`
  - Utilise `@base-ui/react` `Combobox` :
    ```
    <Combobox.Root items={items} ...>
      <Combobox.Input />
      <Combobox.Positioner>
        <Combobox.Popup>
          <Combobox.List>
            <Group label="Villes">...</Group>
            <Group label="Quartiers">...</Group>
            <Group label="Types">...</Group>
          </Combobox.List>
        </Combobox.Popup>
      </Combobox.Positioner>
    </Combobox.Root>
    ```
  - Highlight de la sous-chaîne tapée via `<mark>` ou `<strong>` (utilitaire `highlightMatch(label, query)`)
  - Badge count à droite (`<span className="text-xs text-stone-500">12</span>`)
  - États visuels : idle / loading (skeleton 3 lignes après 250ms) / empty (`Aucun résultat pour « {q} »` + 2 liens fallback `/properties` et `/properties?type=apartment`) / error (silencieux)
  - On select → `router.push('/properties?' + qsForSuggestion(item))` :
    - city → `?city={label}`
    - neighborhood → `?city={item.city}&neighborhood={item.label}`
    - property_type → `?type={item.value}`
  - Sur `Enter` sans sélection → `router.push('/properties?q={input}')` (fallback recherche libre)
  - Sur `Esc` → ferme le dropdown
  - Tailwind 4 (cohérence design system existant : `rounded-xl bg-white ring-1 ring-stone-200 shadow-lg`)

- `takussan-web/src/hooks/useSuggest.ts`
  - `useSuggest(q: string, options?: { enabled?: boolean }): UseQueryResult<SuggestResponse>`
  - Debounce 150ms via `useDebouncedValue(q, 150)` (helper local — 6 lignes)
  - Wrap `useApiQuery({ url: '/search/suggest', params: { q: debouncedQ, limit: 10 }, enabled: debouncedQ.length >= 1 })`
  - `staleTime: 60_000` (cohérent avec Cache-Control backend)
  - AbortController : `useApiQuery` propage déjà via TanStack Query — pas d'effort manuel

- `takussan-web/src/types/search.ts` (ou étendre un fichier existant)
  - `type SuggestCity = { label: string; slug?: string; count: number }`
  - `type SuggestNeighborhood = { label: string; city: string; slug?: string; count: number }`
  - `type SuggestPropertyType = { label: string; value: string; count: number }`
  - `type SuggestResponse = { data: { cities: SuggestCity[]; neighborhoods: SuggestNeighborhood[]; property_types: SuggestPropertyType[] } }`

- `takussan-web/src/lib/highlightMatch.ts`
  - `highlightMatch(label: string, query: string): { before: string; match: string; after: string }`
  - Insensible casse + accents (utilise `normalize` côté front : `s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()`)
  - Si pas de match → `{ before: label, match: '', after: '' }`

### Frontend — intégrations

- Modification `takussan-web/src/app/(public)/page.tsx` (Hero) :
  - Identifier l'input de recherche actuel du Hero (probablement un `<input>` simple)
  - Le remplacer par `<SearchAutocomplete variant="hero" />`
  - Conserver le styling Hero (largeur full, ombre, blur)

- Modification `takussan-web/src/app/(dashboard)/layout.tsx` (ou le composant Navbar du dashboard si présent) :
  - Ajouter `<SearchAutocomplete variant="navbar" />` dans la barre globale
  - Width contrainte (~ `max-w-md` desktop, hidden mobile sauf icône → expand)

### Frontend — i18n

- Ajout dans `takussan-web/src/messages/fr.json` :
  ```json
  "search": {
    "suggest": {
      "placeholder": "Rechercher une ville, un quartier, un type de bien…",
      "groups": {
        "cities": "Villes",
        "neighborhoods": "Quartiers",
        "property_types": "Types"
      },
      "empty": "Aucun résultat pour « {query} »",
      "fallback": {
        "all_cities": "Voir toutes les villes",
        "all_types": "Tous les types"
      },
      "loading": "Chargement…"
    }
  }
  ```
- Idem pour `en.json` et `wo.json` (traductions équivalentes — wolof : `Seet`, `Dëkk yi`, etc.)

### Frontend — tests

- `takussan-web/src/components/search/SearchAutocomplete.test.tsx` (Vitest + Testing Library) — 6 tests :
  1. `renders empty state when no query` — affiche placeholder, pas de dropdown
  2. `debounces 150ms before fetching` — type "da" rapidement, `vi.advanceTimersByTime(149)` → pas d'appel API ; `+1ms` → appel
  3. `displays grouped suggestions on success` — mock fetch `{ cities: [{label:'Dakar', count:12}], …}` → dropdown ouvert, "Dakar" visible, count 12 visible
  4. `keyboard navigation: Arrow Down moves selection, Enter pushes route` — fireEvent ArrowDown 2x + Enter → router.push appelé avec bonne URL
  5. `Escape closes dropdown` — fireEvent Escape → dropdown caché
  6. `empty state shows fallback links` — mock réponse vide → "Aucun résultat" + liens fallback rendus

- `takussan-web/src/hooks/useSuggest.test.ts` — 2 tests :
  1. `respects enabled when q is empty`
  2. `passes q and limit to apiFetch`

---

## Détails d'implémentation clés

### Pourquoi pas Scout / Meilisearch pour ce endpoint ?

Scout est conçu pour la **recherche full-text par bien** (`Property::search($q)`). L'autocomplete a besoin d'une **agrégation distincte** sur des champs catégoriels (city, neighborhood, type) avec un comptage. Scout ne le fait pas nativement et ne servirait qu'à indirectement reconstituer cette agrégation. L'approche directe Eloquent + cache est plus simple, plus rapide à mettre en cache, et indépendante du driver Scout (qui peut être `collection` en CI).

### Stratégie cross-DB pour la tolérance accents

Trois options envisagées :

| Option | Pros | Cons |
|---|---|---|
| Postgres `unaccent` | SQL natif, très rapide | Pas portable (SQLite, MySQL ne l'ont pas) ; nécessite extension + migration |
| Colonne `*_normalized` dénormalisée | Index B-tree, marche partout | Migration + observer + maintenance ; 2 colonnes nouvelles |
| **Cache PHP + filtre mémoire** ✅ | Aucune migration, cross-DB, P95 cible facile | Cardinalité doit rester ≤ ~5000 entrées (vrai pour le Sénégal) |

**Choisi : cache PHP + filtre mémoire**. Le précalcul est cappé à 500 entrées par groupe. Le filtre prefix sur ~500 strings normalisées en PHP prend < 1ms. La requête Eloquent uncached prend ~30ms (sur SQLite local). Le P95 < 80ms est large.

### Performance

- **Cache hit** (cas dominant après 5min de chauffe) : `Cache::get` Redis (~1ms) + filtre mémoire (~1ms) = ~5ms total côté serveur, bien sous les 80ms.
- **Cache miss** (1 par locale toutes les 5min) : 3 requêtes Eloquent (cities, neighborhoods, types). Sur SQLite avec ~10k properties : ~50ms cumulés. Acceptable car rare.
- **Test perf en CI** : assert `count(DB::queries) <= 3` après warmup et `<= 0` après cache hit.

### Sécurité / PII

- `cities`, `neighborhoods` : champs sont déjà publics (visibles sur la page détail bien ouverte sans auth).
- `property_types` : enum, pas de PII.
- Aucun nom propriétaire / email / téléphone n'est exposé. Le Service ne joint **jamais** la table `users` ou `agencies`.
- Filtre `status = 'published'` strict via le scope `public()` ou `where('status', PropertyStatus::Published)` direct dans la query d'agrégation. Test dédié AC3.

### Rate-limit & throttle

- Middleware Laravel natif : `throttle:60,1` (60 req par minute, par IP). Pattern déjà utilisé dans `routes/api/public.php` (`throttle:30,1`, `throttle:60,1`).
- Au-delà : Laravel renvoie automatiquement `429 Too Many Requests`. Test dédié AC5.

### Cache-Control HTTP

`Cache-Control: public, max-age=60` permet aux proxies (et au navigateur si revisite) de mettre en cache 60s. Combiné au cache Redis 5min côté app, on a une double couche : navigateur (60s) → app cache (5min) → DB.

### Gestion locale dans `SuggestService`

Laravel résout la locale via `app()->getLocale()`. Le middleware `localization` (s'il existe — sinon le middleware est trivial) lit `Accept-Language` ou `?locale=`. Pour les tests, on force via `$this->withHeader('Accept-Language', 'fr')` ou `app()->setLocale('fr')`.

### Frontend — choix Base UI Combobox vs cmdk vs custom

`@base-ui/react` ^1.4 est **déjà installé** (cf. exploration `package.json`) ; aucune dépendance à ajouter. Son `Combobox` :
- ARIA combobox standard (role="combobox", aria-controls, aria-activedescendant)
- Navigation clavier native (↑↓/Enter/Esc/Home/End)
- Compose avec `Popover` (positionnement automatique, escape navigateur viewport)
- Compatible RSC client boundaries (use client)

**Choisi : Base UI**. Pas de cmdk (autre dépendance), pas de custom (réinventer ARIA = risque a11y).

### Format URL après sélection

| Type sélection | URL push |
|---|---|
| city `Dakar` | `/properties?city=Dakar` |
| neighborhood `Almadies` (city `Dakar`) | `/properties?city=Dakar&neighborhood=Almadies` |
| property_type `apartment` | `/properties?type=apartment` |
| Enter sans sélection (texte libre) | `/properties?q=<texte>` |

Cohérent avec le breadcrumb existant (`PropertyBreadcrumb.tsx` utilise déjà `/properties?city=…`) et les filtres URL-synced de TCK-039.

---

## Mapping critères d'acceptation → vérifications

| AC | Vérification |
|---|---|
| **AC1** — `?q=da` retourne villes en `da*` avec count > 0 | `SearchSuggestTest::test_returns_cities_matching_prefix` + smoke `curl /api/search/suggest?q=da` |
| **AC2** — `?q=daka` ≡ `?q=Dakar` ≡ `?q=DÄKAR` | `SearchSuggestTest::test_case_and_accent_insensitive` (3 assertions sur le même seed) |
| **AC3** — bien `status=draft` n'apparaît pas | `SearchSuggestTest::test_excludes_draft_properties` |
| **AC4** — P95 < 80ms sur 10k biens | Bench local : `php artisan test --filter=test_cache_warm` mesure `microtime` ; CI : `Benchmark::measure(fn () => $service->resolve('da', 10, 'fr'), iterations: 100)` < 80ms |
| **AC5** — 60+ req/min IP → 429 | `SearchSuggestTest::test_rate_limit_returns_429_after_60_requests` |
| **AC6** — Hero, taper "Dak" → dropdown < 200ms | `SearchAutocomplete.test.tsx::debounces 150ms before fetching` (timer mock 150ms + résolution de fetch ≤ 50ms = budget total respecté) ; smoke manuel chrome-devtools |
| **AC7** — clic "Dakar" → `/properties?city=Dakar` cohérent avec filtre direct | `SearchAutocomplete.test.tsx::keyboard navigation Enter pushes route` + smoke comparaison résultat suggestion vs résultat URL directe |
| **AC8** — flèches/Enter/Esc fonctionnent | `SearchAutocomplete.test.tsx::keyboard navigation` + `Escape closes dropdown` |

---

## Variables d'environnement

**Aucune nouvelle variable**. L'endpoint utilise :
- `CACHE_STORE=redis` (déjà configuré)
- `DB_CONNECTION=sqlite` (par défaut, override en prod via `pgsql`/`mysql` — la stratégie cache mémoire est DB-agnostique)
- Rate-limit `throttle:60,1` codé en dur dans la route (cohérent avec `public.php` existant)

Côté frontend, `NEXT_PUBLIC_API_URL` (déjà configuré) suffit.

---

## Étapes d'exécution (ordre recommandé)

### Backend
1. **Création FormRequest** `SuggestRequest` + petits tests de validation (q vide, q > 50 chars, limit > 30).
2. **Service** `SuggestService` : `normalize`, `filterPrefix` d'abord (purement fonctionnels) + tests unit.
3. **Service** : `getBase` (avec cache + queries) + tests unit (mock Cache).
4. **Service** : `resolve` (orchestration) + tests unit.
5. **Controller** `SuggestController` + Resource (ou inline) + Cache-Control header.
6. **Route** ajoutée dans `routes/api/search.php` avec `throttle:60,1`.
7. **Tests Feature** `SearchSuggestTest` (8 cas, dont AC3 et AC5).
8. **Lint** `./vendor/bin/pint` (mémoire utilisateur — obligatoire avant commit).

### Frontend
9. **Types** `src/types/search.ts` (ou extension existante).
10. **Helper** `highlightMatch.ts` + tests Vitest.
11. **Hook** `useSuggest.ts` + tests Vitest.
12. **Composant** `SearchAutocomplete.tsx` (variant `hero` d'abord, `navbar` ensuite).
13. **Tests** `SearchAutocomplete.test.tsx` (6 cas dont AC6, AC7, AC8).
14. **i18n** : ajouter `search.suggest.*` dans fr/en/wo.
15. **Intégration Hero** dans `app/(public)/page.tsx`.
16. **Intégration navbar dashboard** dans `app/(dashboard)/layout.tsx` (ou Navbar component).
17. **Lint** `npm run lint`.

### Final
18. **INDEX.md** : passer TCK-107 `todo → review` à l'ouverture de la PR ; **target = `dev`** (mémoire utilisateur).
19. **Commit du plan** : `docs(TCK-107): add search autocomplete implementation plan` (à l'image de TCK-105 / TCK-106).

---

## Vérification end-to-end

### Tests automatisés ciblés

```bash
# Backend
cd takussan-api
php artisan test --filter='SearchSuggest|SuggestService'   # toutes vertes
php artisan test                                           # pas de régression

# Frontend
cd takussan-web
npx vitest run --reporter=verbose src/components/search src/hooks/useSuggest src/lib/highlightMatch
npm run lint
```

### Smoke manuel

1. **Backend** : seeder local avec 10–20 properties published (mix de villes Dakar / Saint-Louis / Thiès et types apartment / villa / land).
2. `php artisan serve --port=8002` (port fixe du projet).
3. `curl 'http://localhost:8002/api/search/suggest?q=Da&limit=5'` → JSON avec groupes peuplés. `curl ...?q=DÄKÄR` → identique. `curl ...?q=` → groupes vides.
4. Boucle `for i in {1..65}; do curl …; done` → les 5 dernières requêtes = 429.
5. **Frontend** : `npm run dev` (port 3000).
6. Aller sur `/`, taper "Da" dans le hero → dropdown apparaît < 200ms après dernier keystroke. Cliquer "Dakar" → URL = `/properties?city=Dakar` ; les biens listés correspondent à ceux qui ont la ville Dakar.
7. Tester ↑↓ / Enter / Esc : navigation visible (focus visible), Enter route, Esc ferme.
8. Login user → barre globale dans le layout dashboard, mêmes comportements.
9. **a11y** : Lighthouse sur la page Hero — score Accessibility ≥ 90.

### Pint / lint

- `./vendor/bin/pint --test` (backend) : pas de diff.
- `npm run lint` (frontend) : pas de warning.

---

## Hors périmètre (rappel + simplifications)

- **Recherche full-text avancée (Meilisearch / Elasticsearch)** : V1 reste sur agrégation Eloquent + cache. Ticket dédié si volume l'exige (> 100 villes ou cardinalité quartiers > 1000).
- **Suggestions personnalisées par historique utilisateur** : feature P3, hors scope.
- **Suggestion d'agences ou d'agents** : pas demandé pour la barre publique.
- **Recherche vocale, mobile-only patterns** : tickets séparés.
- **Autocomplétion sur l'éditeur de fiche bien (admin)** : peut réutiliser l'endpoint mais UI différente — ticket dédié si besoin.
- **Slugs villes/quartiers** : le ticket les mentionne dans le contrat (`{label, slug, count}`). Comme `addresses` n'a pas de colonne `slug` aujourd'hui, on génère un `slug` côté Service via `Str::slug($label)` (pas de migration). Le frontend l'utilise uniquement comme `key` React, pas comme URL (l'URL produite reste `?city=Dakar` en label, ce qui est cohérent avec les filtres URL-synced existants).
- **Migration `addresses (city, neighborhood)` index** : non nécessaire avec la stratégie cache (les requêtes d'agrégation ne tournent qu'1× par 5min par locale). À reconsidérer si la cardinalité explose.
