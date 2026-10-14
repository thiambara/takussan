# TCK-633 — Lot E : filtres de recherche — plan d'implémentation

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Rendre le panneau de filtres public juste et complet — chambres, salles de bain et étage
deviennent des **minimums**, la carte reçoit et applique **tous** les filtres de la liste (même
compte), ville / quartier / équipements se **choisissent** dans le référentiel et le catalogue,
« Meublé » a trois états, « Louer » précède « Acheter », les essentiels restent visibles et le reste
se replie sous « Plus de filtres », et les puces de catégorie de la barre n'écrasent plus une
sélection multiple.

**Architecture:** Côté API, `PropertySearchService::buildFilter()` passe trois égalités en `>=` ;
`MapPublicPropertyRequest` **hérite** de `SearchPublicPropertyRequest` et retire les seules clés propres
à la liste (une constante, `CLES_PROPRES_A_LA_LISTE`) ; une classe neuve,
`App\Services\Search\FiltresDeLaCarte`, traduit chaque filtre structuré en SQL pour `/map` (qui reste
SQL, ADR-0023), gardée par un test de parité **exhaustif** liste ↔ carte. Côté front, la carte reçoit
`parametresDeLaCarte(filtersToParams(filters))` (même constante, gardée par le test de parité front ↔
PHP) ; les listes du référentiel passent par trois hooks React Query et **un seul adaptateur**,
`ChoixDuReferentiel.tsx`, seul importateur de la primitive `components/ui/combobox.tsx` du lot D.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit (`Tests\ApiTestCase`, `InteractsWithMeilisearch`),
Meilisearch, PostgreSQL 17 ; Next.js 16, React 19, TypeScript 5, TanStack Query v5, next-intl,
`@base-ui/react` 1.7.0 (combobox via la primitive shadcn `base-nova` de D), vitest 4 + Testing Library.

---

## Contraintes globales (à relire avant chaque tâche)

Reprises du plan maître [`2026-10-12-tck-633-lot-retours-porteur.md`](2026-10-12-tck-633-lot-retours-porteur.md)
(§ Règles de l'arbre partagé) — **non négociables** :

1. **Aucune commande git qui écrit** : ni `add`, `commit`, `checkout`, `stash`, `restore`, `reset`,
   `switch`, `merge`, `push`. Les étapes « commit » de ce plan sont des étapes **« signaler à la
   session les fichiers à commiter »** ; c'est la session qui commite, en français,
   `type(portée): … (TCK-633)`.
2. **Territoire E** (plan maître) : `components/search/FilterSidebar.tsx`, `SearchToolbar.tsx`,
   `types/search.ts`, `lib/recherche-publique.ts`, `hooks/useSearch.ts`,
   `MapPublicPropertyRequest.php`, `SearchPublicPropertyRequest.php`, `components/home/Navbar.tsx` ;
   espace i18n **`search.filters.*`**. Plus les **fichiers neufs** de ce plan et les **tests** des
   fichiers du territoire. Tout autre fichier → champ `collisions` du rapport, **jamais une
   édition**, sauf les deux exceptions que la Tâche 0 vérifie (co-tenus listés ci-dessous).
3. **Fichiers co-tenus** — édités **uniquement par l'outil Edit**, par petits blocs ancrés sur un
   **texte** (jamais sur un numéro de ligne : un autre lot a pu les décaler), jamais par `sed`, script
   ou `Write` ; si Edit signale un changement, relire puis rejouer :
   - `takussan-api/app/Services/Search/PropertySearchService.php` (E, F — **E passe après F**) ;
   - `takussan-web/src/components/property/PropertiesDiscoveryPage.tsx` (E, F) ;
   - `takussan-web/src/messages/{fr,en,wo}.json` (tous ; E n'écrit que sous `search.filters`) ;
   - `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php` — **co-tenu C, F, hors
     territoire E** : la Tâche 4 a besoin d'y remplacer un bloc de `map()`. Voir Tâche 0, étape 0.7.
4. **Tests** : un agent ne lance **que** ses classes (`php artisan test <fichier>`,
   `npx vitest run <fichier>`) ou `php bin/impacted-tests.php --run`. **Jamais la suite entière.**
   Aucune commande de plus de 10 minutes.
5. **Ablation** à chaque tâche qui ajoute un test : copier le fichier de production dans le
   scratchpad, noter son `md5`, retirer le correctif, constater le **rouge**, restaurer par `cp`,
   prouver par `md5` identique. **Jamais `git checkout`.** Dans ce plan, `ABL` désigne
   `<scratchpad de l'agent>/ablations-lot-e` (le scratchpad est celui que nomme l'invite système de
   l'agent) ; chaque commande le redéfinit, l'état du shell ne persistant pas.
6. **Avant de signaler des fichiers** : `./vendor/bin/pint` (backend) ; `npx tsc --noEmit`,
   `npm run lint`, `npm run check:i18n` (front).
7. **i18n** : toute chaîne visible en **fr, en, wo**, vouvoiement ; insertion par Edit sous
   `search.filters`, jamais de reformatage du fichier.
8. **Rapport** : `docs/plans/rapports/tck-633-lot-e.json` (outil Write), **verdict en premier**, puis
   `fichiers`, `tests`, `ablations`, `ecarts_au_ticket`, `collisions`. Message final de l'agent :
   **une ligne**.
9. Principes du dépôt : migration aucune ; sparse fieldsets et `filter[]` côté front ;
   `CaseInsensitive::sql()` + `fold()` par paire (ADR-0025) ; React Compiler actif — pas de
   `useMemo`/`useCallback` de réflexe dans le code neuf.

Toutes les commandes sont écrites depuis la racine du dépôt
`/Users/aminethiam/Documents/perso/takussan` (le shell des agents y revient à chaque appel).

---

## Carte des fichiers

Lignes relevées le 2026-10-12 sur `docs/tck-633-lot-retours-porteur` (avant D et F : elles peuvent
avoir bougé — les Edit s'ancrent sur le texte).

### Backend (`takussan-api/`)

| Fichier | Action | Où |
|---|---|---|
| `app/Services/Search/PropertySearchService.php` (co-tenu E, F) | Modifier | `buildFilter()` 432-559 : `bedrooms = ` l. 457, `bathrooms = ` l. 460, `floor_number = ` l. 487 |
| `app/Http/Requests/Public/MapPublicPropertyRequest.php` | Réécrire (territoire E, non co-tenu) | fichier entier, 76 l. |
| `app/Http/Requests/Public/SearchPublicPropertyRequest.php` | **Lire seulement** (classe parente) | `rules()` 97-174 — forme inchangée (le test front la lit par regex) |
| `app/Services/Search/FiltresDeLaCarte.php` | **Créer** | — |
| `app/Http/Controllers/Public/PublicPropertyController.php` (co-tenu C, F, **hors E**) | Modifier un bloc | `map()` 507 (signature), 546-558 (bloc type/contract/prix) ; import l. 57 |
| `tests/Feature/Search/SearchMinimumFiltersTest.php` | **Créer** | — |
| `tests/Feature/Search/MapFiltersParityTest.php` | **Créer** | — |
| `tests/Feature/Public/PropertySearchTest.php` | Modifier | `test_filter_by_bedrooms` 83-93 |
| `tests/Feature/PublicPropertySearchFiltersTest.php` | Modifier | `test_floor_number_filter_returns_matching_properties` 28-52 |
| `tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php` | Modifier une ligne | provider `cles()`, ligne `'floor_number' => …` |
| `config/scout.php` | **Aucun changement** | `bedrooms`, `bathrooms`, `floor_number` déjà dans `filterableAttributes` (183-211) |

### Frontend (`takussan-web/src/`)

| Fichier | Action | Où |
|---|---|---|
| `lib/recherche-publique.ts` | Modifier | ajout après `parametresDeRecherche` (119-128) |
| `lib/__tests__/recherche-publique.carte.test.ts` | **Créer** | — |
| `types/__tests__/search-filters.parity.test.ts` | Modifier | constantes 53-57, describe ajouté en fin de fichier |
| `components/property/PropertiesDiscoveryPage.tsx` (co-tenu E, F) | Modifier | import l. 22 ; `mapFilters` 368-392 |
| `components/property/__tests__/PropertiesDiscoveryPage.carte-geo.test.tsx` | Modifier | tests 67-110 |
| `components/property/__tests__/PropertiesDiscoveryPage.{repli,etat-vide,error,grille,outils,carte-mobile}.test.tsx` | Modifier (une ligne chacun) | après le `vi.mock('@/components/home/Footer', …)` |
| `messages/{fr,en,wo}.json` (co-tenus) | Modifier sous `search.filters` | fr/en 4268-4273, wo 2664-2669 (`floors`) |
| `types/search.ts` | Modifier | libellés `bedrooms` l. 300, `bathrooms` l. 307, `floor_number` 349-350 |
| `components/search/__tests__/SearchToolbar.test.tsx` | Modifier | attendus 103-104, 110, 155 |
| `components/search/FilterSidebar.tsx` (1063 l.) | Modifier | imports 1-16, données 156-200, props 238-243, docblock 248-269, signature 270-282, brouillons 292-327, commits 350-424, `contractTypes` 426, tiroir 450-483, corps 544-845 |
| `components/search/__tests__/FilterSidebar.lot-e.test.tsx` | **Créer** | — |
| `components/search/__tests__/doublure-choix-du-referentiel.tsx` | **Créer** (doublure, non exécutée) | — |
| `components/search/__tests__/FilterSidebar.test.tsx` | Réécrire (test du territoire) | fichier entier, 320 l. |
| `components/search/__tests__/FilterSidebar.retour.test.tsx` | Modifier | 79, 151, 221-238, 303, 311 + mock |
| `components/search/__tests__/FilterSidebar.tiroir.test.tsx` | Modifier | 28 + mock |
| `components/search/__tests__/attente-des-puces.test.tsx` | Modifier | 52, 57-60 + mock |
| `lib/queries/referentiel-public.ts` | **Créer** (`'use client'`) | — |
| `lib/queries/__tests__/referentiel-public.test.tsx` | **Créer** | — |
| `components/search/ChoixDuReferentiel.tsx` | **Créer** — seul importateur de `@/components/ui/combobox` | — |
| `components/search/__tests__/ChoixDuReferentiel.test.tsx` | **Créer** | — |
| `components/home/Navbar.tsx` | Modifier | 176-198, 310-327, 383, 435 |
| `components/home/__tests__/Navbar.selection-multiple.test.tsx` | **Créer** | — |
| `hooks/useSearch.ts`, `components/search/SearchToolbar.tsx` | **Aucun changement** (relus : les libellés de puce viennent de `types/search.ts`) | — |

---

## Tâche 0 — prérequis (aucune édition)

**But :** vérifier sur disque que D et F ont livré ce que ce plan consomme, que les services
répondent et que la base de départ est verte. **Tout écart → `collisions` du rapport, et
l'adaptation se limite au seul fichier adaptateur désigné** (`ChoixDuReferentiel.tsx`,
`referentiel-public.ts`).

**Étape 0.1 — charge et services**

```bash
uptime; sysctl -n hw.ncpu
./dev.sh doctor
```

Attendu : les trois moyennes d'`uptime` notées au rapport ; `doctor` nomme PostgreSQL, Meilisearch,
Redis, Mailpit comme joignables. Sinon : s'arrêter, verdict `bloque`.

**Étape 0.2 — D et F ont rendu leur rapport**

```bash
ls docs/plans/rapports/
node -e 'for (const l of ["d","f"]) { const r = require(`./docs/plans/rapports/tck-633-lot-${l}.json`); console.log(l, Object.keys(r)[0], JSON.stringify(r[Object.keys(r)[0]])); }'
```

Attendu : `tck-633-lot-d.json` et `tck-633-lot-f.json` existent, verdict vert. Absents → verdict
`bloque` (E passe après D et F, plan maître § Ordre).

**Étape 0.3 — les routes publiques du référentiel (D → E)**

```bash
(cd takussan-api && php artisan route:list --path=public/geo --json) | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ const r=JSON.parse(s);
for (const x of r) console.log(x.method, x.uri, (x.middleware||[]).some(m=>/sanctum|Authenticate/.test(m)) ? "AUTH" : "public"); });'
```

Attendu : trois lignes `GET|HEAD api/public/geo/regions|cities|neighborhoods public`.

```bash
grep -rn "region" takussan-api/app/Http/Requests | grep -i geo
grep -rn "'city'" takussan-api/app/Http/Requests | grep -i geo
```

Attendu : `region` n'est **pas** `required` pour `cities` (E liste toutes les villes sans région) ;
`city` est accepté par `neighborhoods`. Si `region` est obligatoire → `collisions` (D) et, dans
`referentiel-public.ts`, ne rien inventer : la Tâche 10 reste rouge sur ce cas, rapport `partiel`.

**Étape 0.4 — le catalogue des équipements lisible sans compte (D → E)**

```bash
(cd takussan-api && php artisan route:list --path=api/tags --method=GET --json) | node -e '
let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{ for (const x of JSON.parse(s)) console.log(x.uri, (x.middleware||[]).join(" ")); });'
grep -n "requestFilterable" takussan-api/app/Models/Tag.php
```

Attendu : `api/tags` **sans** `auth:sanctum` (aujourd'hui, `routes/api/tags.php` est entièrement sous
`auth:sanctum` — un visiteur anonyme recevrait 401) ; `$requestFilterable` contient `'status'`. Sinon →
`collisions` (D) : la liste des équipements restera vide pour un visiteur anonyme ; la Tâche 10 est
écrite contre l'interface et ses tests passent (fetch simulé).

**Étape 0.5 — la primitive combobox (D → E)**

```bash
node -e '
const s = require("fs").readFileSync("takussan-web/src/components/ui/combobox.tsx", "utf8");
const bloc = (s.match(/export\s*\{[\s\S]*?\}/) || [""])[0];
const noms = ["Combobox","ComboboxInput","ComboboxContent","ComboboxList","ComboboxItem","ComboboxEmpty","ComboboxChips","ComboboxChip","ComboboxChipsInput","ComboboxValue","useComboboxAnchor"];
const manque = noms.filter(n => !new RegExp("\\b" + n + "\\b").test(bloc) && !new RegExp("export (function|const) " + n + "\\b").test(s));
console.log(manque.length ? "MANQUE: " + manque.join(", ") : "OK combobox");
console.log("showClear:", /showClear/.test(s), "· showRemove:", /showRemove/.test(s));'
```

Attendu : `OK combobox`, `showClear: true` — l'API de la primitive shadcn `base-nova` (relevée sur
`ui.shadcn.com/r/styles/base-nova/combobox.json` le 2026-10-12 : `Combobox` = `ComboboxPrimitive.Root`,
`ComboboxInput` avec `showTrigger`/`showClear`, `ComboboxChip` avec `showRemove`,
`useComboboxAnchor()`). Autre API → `collisions`, et la Tâche 10 ne réécrit **que**
`ChoixDuReferentiel.tsx` ; ses tests, écrits par rôles ARIA, ne changent pas.

**Étape 0.6 — F est passé sur `PropertySearchService` et la recherche garde `featured`**

```bash
grep -c "ranked_at\|sponsored" takussan-api/app/Services/Search/PropertySearchService.php
grep -n "'bedrooms = '\|'bathrooms = '\|'floor_number = '" takussan-api/app/Services/Search/PropertySearchService.php
grep -n "'featured' =>" takussan-api/app/Http/Requests/Public/SearchPublicPropertyRequest.php
```

Attendu : un compte ≥ 1 (F a écrit) ; les trois égalités toujours présentes (E les remplace) ;
`'featured' => 'nullable|boolean'`. Compte à 0 → F n'est pas passé : **s'arrêter** (plan maître :
E après F sur ce fichier).

**Étape 0.7 — l'édition de `map()` est-elle autorisée ?**

```bash
grep -n "PublicPropertyController.php" docs/plans/2026-10-12-tck-633-lot-retours-porteur.md
```

Attendu : la ligne des co-tenus porte **E** (« E : filtres de `map()` »). Aujourd'hui elle porte
`C, F` seulement. Si E n'y figure pas : exécuter tout le plan **sauf l'étape 4.4** (édition du
contrôleur), laisser `MapFiltersParityTest` rouge sur les clés neuves, écrire en `collisions`
l'édition exacte de l'étape 4.4, verdict `partiel`. (Écart n° 4, à trancher par la session **avant**
de lancer E.)

**Étape 0.8 — base de départ verte**

```bash
(cd takussan-api && php artisan test tests/Feature/Public/PropertySearchTest.php tests/Feature/PublicPropertySearchFiltersTest.php tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php tests/Feature/Public/PropertyMapTest.php tests/Feature/Public/PropertyMapRadiusTest.php)
(cd takussan-web && npx vitest run src/components/search src/components/home/__tests__/Navbar.recherche.test.tsx src/components/home/__tests__/Navbar.attente-categorie.test.tsx src/components/property/__tests__ src/lib/__tests__/recherche-publique.test.ts src/types/__tests__/search-filters.parity.test.ts src/test/__tests__/surface-publique.contraste.test.ts)
```

Attendu : tout vert. Un rouge **avant** toute édition est noté au rapport (`tests.base_rouge`) et
n'est pas imputé à E.

---

## Tâche 1 — chambres, salles de bain et étage deviennent des minimums (API)

**Files:**
- Create: `takussan-api/tests/Feature/Search/SearchMinimumFiltersTest.php`
- Modify (co-tenu, Edit) : `takussan-api/app/Services/Search/PropertySearchService.php` (`buildFilter()`)

**Étape 1.1 — écrire le test qui échoue**

```php
<?php

namespace Tests\Feature\Search;

use App\Models\Property;
use App\Models\SavedSearch;
use App\Models\User;
use App\Services\Model\SearchService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-633 (lot E) — chambres, salles de bain et étage sont des MINIMUMS.
 *
 * Retour du porteur du 2026-10-11 : « 5+ chambres » ne trouvait pas la maison de six chambres.
 * Le panneau affiche « 5+ », l'API comparait par ÉGALITÉ (`bedrooms = 5`). Chaque test porte un
 * bien AU-DESSUS du seuil — c'est lui que l'égalité ratait —, un bien au seuil, un bien
 * en dessous et un bien sans valeur : les deux derniers ne sortent jamais.
 *
 * `featured` est posé à `false` : les places réservées du lot F (ADR-0061 §7) remontent les biens
 * en vedette et ne doivent pas brouiller ces ensembles.
 */
class SearchMinimumFiltersTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    public function test_cinq_chambres_et_plus_trouve_la_maison_de_six_chambres(): void
    {
        $six = $this->bien(['type' => 'house', 'bedrooms' => 6]);
        $cinq = $this->bien(['type' => 'house', 'bedrooms' => 5]);
        $this->bien(['type' => 'house', 'bedrooms' => 4]);
        $this->bien(['type' => 'house', 'bedrooms' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$six->id, $cinq->id]), $this->ids('bedrooms=5'));
    }

    public function test_trois_salles_de_bain_et_plus_garde_les_biens_qui_en_ont_davantage(): void
    {
        $quatre = $this->bien(['bathrooms' => 4]);
        $trois = $this->bien(['bathrooms' => 3]);
        $this->bien(['bathrooms' => 2]);
        $this->bien(['bathrooms' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$quatre->id, $trois->id]), $this->ids('bathrooms=3'));
    }

    public function test_quatrieme_etage_et_plus_trouve_le_septieme_et_jamais_un_etage_inconnu(): void
    {
        $septieme = $this->bien(['floor_number' => 7]);
        $quatrieme = $this->bien(['floor_number' => 4]);
        $this->bien(['floor_number' => 2]);
        $this->bien(['floor_number' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$septieme->id, $quatrieme->id]), $this->ids('floor_number=4'));
    }

    public function test_rez_de_chaussee_et_plus_garde_tout_etage_connu(): void
    {
        $rdc = $this->bien(['floor_number' => 0]);
        $deuxieme = $this->bien(['floor_number' => 2]);
        $this->bien(['floor_number' => null]);
        $this->indexProperties();

        $this->assertSame($this->tries([$rdc->id, $deuxieme->id]), $this->ids('floor_number=0'));
    }

    /** `alertMatches()` passe par `buildFilter()` : une alerte « 5+ chambres » capte la maison de six. */
    public function test_une_alerte_cinq_chambres_et_plus_capte_la_maison_de_six(): void
    {
        $six = $this->bien(['bedrooms' => 6, 'published_at' => now()->subHour()]);
        $this->bien(['bedrooms' => 4, 'published_at' => now()->subHour()]);
        $this->indexProperties();

        $search = SavedSearch::factory()->create([
            'user_id' => User::factory()->create()->id,
            'criteria' => ['bedrooms' => 5],
        ]);
        $captes = app(SearchService::class)->getMatchingProperties($search, null, now())['properties']->modelKeys();

        $this->assertSame([$six->id], $captes);
    }

    /** @param  array<string, mixed>  $attributs */
    private function bien(array $attributs): Property
    {
        return Property::factory()->published()->create([
            'featured' => false,
            'published_at' => now()->subHour(),
            ...$attributs,
        ]);
    }

    /** @return list<int> */
    private function ids(string $requete): array
    {
        $reponse = $this->getJson('/api/public/properties/search?per_page=100&'.$requete)->assertOk();

        return $this->tries(array_column($reponse->json('data'), 'id'));
    }

    /**
     * @param  array<int, int|string>  $ids
     * @return list<int>
     */
    private function tries(array $ids): array
    {
        $ids = array_map('intval', $ids);
        sort($ids);

        return $ids;
    }
}
```

**Étape 1.2 — le voir échouer**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/SearchMinimumFiltersTest.php)
```

Attendu : **5 rouges**, chacun `Failed asserting that two arrays are identical` (seul le bien AU
seuil sort : `[cinq]` au lieu de `[cinq, six]`, `[rdc]` au lieu de `[rdc, deuxieme]`, `[]` pour
l'alerte).

**Étape 1.3 — le correctif (Edit, trois blocs ancrés sur le texte)**

Bloc 1 — remplacer :

```php
        if (isset($p['bedrooms']) && is_numeric($p['bedrooms'])) {
            $filter[] = 'bedrooms = '.(int) $p['bedrooms'];
        }
        if (isset($p['bathrooms']) && is_numeric($p['bathrooms'])) {
            $filter[] = 'bathrooms = '.(int) $p['bathrooms'];
        }
```

par :

```php
        // TCK-633 (lot E) — chambres, salles de bain et étage sont des MINIMUMS : le panneau
        // affiche « 5+ », et « 5+ chambres » doit trouver la maison de six. L'égalité la ratait.
        // `alertMatches()` passe par ici : les alertes suivent, comme le chemin haversine
        // (`App\Services\Model\SearchService`), qui lisait déjà `bedrooms >=`. Un bien sans
        // valeur reste exclu — Meilisearch écarte les NULL d'une comparaison numérique.
        if (isset($p['bedrooms']) && is_numeric($p['bedrooms'])) {
            $filter[] = 'bedrooms >= '.(int) $p['bedrooms'];
        }
        if (isset($p['bathrooms']) && is_numeric($p['bathrooms'])) {
            $filter[] = 'bathrooms >= '.(int) $p['bathrooms'];
        }
```

Bloc 2 — remplacer :

```php
        if (isset($p['floor_number']) && is_numeric($p['floor_number'])) {
            $filter[] = 'floor_number = '.(int) $p['floor_number'];
        }
```

par :

```php
        // TCK-633 (lot E) — « 2e et + », pas « au 2e » : même règle que les chambres ci-dessus.
        if (isset($p['floor_number']) && is_numeric($p['floor_number'])) {
            $filter[] = 'floor_number >= '.(int) $p['floor_number'];
        }
```

**Étape 1.4 — le voir passer**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/SearchMinimumFiltersTest.php)
```

Attendu : `Tests: 5 passed`.

**Étape 1.5 — ablation**

```bash
ABL=<scratchpad>/ablations-lot-e; mkdir -p "$ABL"
cp takussan-api/app/Services/Search/PropertySearchService.php "$ABL/PropertySearchService.php"
md5 -q takussan-api/app/Services/Search/PropertySearchService.php | tee "$ABL/PropertySearchService.md5"
```

Puis, par Edit, remettre `'bedrooms >= '` en `'bedrooms = '` (une seule occurrence), et :

```bash
(cd takussan-api && php artisan test tests/Feature/Search/SearchMinimumFiltersTest.php --filter=chambres)
```

Attendu : **2 rouges** (`cinq_chambres…`, `une_alerte…`). Restaurer :

```bash
ABL=<scratchpad>/ablations-lot-e
cp "$ABL/PropertySearchService.php" takussan-api/app/Services/Search/PropertySearchService.php
md5 -q takussan-api/app/Services/Search/PropertySearchService.php; cat "$ABL/PropertySearchService.md5"
```

Attendu : deux empreintes identiques. Noter l'ablation au rapport (fichier, retrait, tests rouges,
md5).

**Étape 1.6 — signaler à la session** : `takussan-api/tests/Feature/Search/SearchMinimumFiltersTest.php`,
`takussan-api/app/Services/Search/PropertySearchService.php` —
`fix(api): chambres, salles de bain et étage filtrés en minimum (TCK-633)`.

---

## Tâche 2 — les tests qui affirmaient l'égalité

**Files:**
- Modify: `takussan-api/tests/Feature/Public/PropertySearchTest.php` (`test_filter_by_bedrooms`)
- Modify: `takussan-api/tests/Feature/PublicPropertySearchFiltersTest.php` (`test_floor_number_filter_returns_matching_properties`)
- Modify: `takussan-api/tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php` (ligne `floor_number` du provider)

**Étape 2.1 — constater les rouges que la Tâche 1 a produits**

```bash
(cd takussan-api && php artisan test tests/Feature/Public/PropertySearchTest.php tests/Feature/PublicPropertySearchFiltersTest.php tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php)
```

Attendu : **2 rouges** — `PublicPropertySearchFiltersTest::test_floor_number_filter_returns_matching_properties`
(2 résultats au lieu d'1 : l'étage 5 répond à « 2 et + ») et
`SavedSearchCriteriaVocabularyTest::test_chaque_cle_filtre_l_alerte` avec le jeu `floor_number` (B à
l'étage 5 n'est plus écarté). `test_filter_by_bedrooms` reste **vert** : il n'affirmait pas l'égalité
(bien à 1 et à 3, seuil 3) — il est réécrit pour affirmer le minimum.

**Étape 2.2 — `PropertySearchTest`** : remplacer la méthode `test_filter_by_bedrooms` entière par :

```php
    /** TCK-633 (lot E) — « 3 chambres et + » : le bien à 4 sort, celui à 1 non. */
    public function test_filter_by_bedrooms_is_a_minimum(): void
    {
        $this->published(['bedrooms' => 1, 'featured' => false]);
        $this->published(['bedrooms' => 3, 'featured' => false]);
        $this->published(['bedrooms' => 4, 'featured' => false]);
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?bedrooms=3');

        $response->assertOk()->assertJsonCount(2, 'data');
        $chambres = array_column($response->json('data'), 'bedrooms');
        sort($chambres);
        $this->assertEquals([3, 4], $chambres);
    }
```

**Étape 2.3 — `PublicPropertySearchFiltersTest`** : remplacer la méthode
`test_floor_number_filter_returns_matching_properties` entière par :

```php
    /** TCK-633 (lot E) — l'étage est un MINIMUM : « 2e et + » garde le 5e, écarte le 1er. */
    public function test_floor_number_filter_is_a_minimum(): void
    {
        foreach ([1, 2, 5] as $etage) {
            Property::factory()->create([
                'status' => PropertyStatus::Available,
                'visibility' => PropertyVisibility::Public,
                'featured' => false,
                'floor_number' => $etage,
                'title' => "On floor {$etage}",
                'published_at' => now(),
            ]);
        }
        $this->indexProperties();

        $response = $this->getJson('/api/public/properties/search?floor_number=2');

        $response->assertOk();
        $titres = array_column($response->json('data'), 'title');
        sort($titres);
        $this->assertSame(['On floor 2', 'On floor 5'], $titres);
    }
```

**Étape 2.4 — `SavedSearchCriteriaVocabularyTest`** : remplacer la ligne

```php
            'floor_number' => ['floor_number', ['floor_number' => 2], ['floor_number' => 5], [], null],
```

par

```php
            // TCK-633 — l'étage est un MINIMUM : B doit passer SOUS le seuil pour être écarté.
            'floor_number' => ['floor_number', ['floor_number' => 2], ['floor_number' => 1], [], null],
```

**Étape 2.5 — vert**

```bash
(cd takussan-api && php artisan test tests/Feature/Public/PropertySearchTest.php tests/Feature/PublicPropertySearchFiltersTest.php tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php)
```

Attendu : 0 échec.

**Étape 2.6 — ablation** : rejouer exactement l'ablation 1.5 (remettre `'floor_number = '`), lancer
les deux classes : attendu **2 rouges** (`test_floor_number_filter_is_a_minimum`, jeu `floor_number`
du vocabulaire). Restaurer par `cp`, prouver par `md5`.

**Étape 2.7 — signaler à la session** : les trois fichiers de test —
`test(api): les filtres de chambres et d'étage affirment le minimum (TCK-633)`.

---

## Tâche 3 — `MapPublicPropertyRequest` hérite des règles de la liste

**Files:**
- Create: `takussan-api/tests/Feature/Search/MapFiltersParityTest.php` (fichier **complet** ; cette
  tâche n'en lance que les tests structurels, la Tâche 4 le reste)
- Rewrite: `takussan-api/app/Http/Requests/Public/MapPublicPropertyRequest.php`

**Étape 3.1 — écrire le test (fichier complet)**

```php
<?php

namespace Tests\Feature\Search;

use App\Http\Requests\Public\MapPublicPropertyRequest;
use App\Http\Requests\Public\SearchPublicPropertyRequest;
use App\Models\Address;
use App\Models\Enums\TagType;
use App\Models\Property;
use App\Models\Tag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ApiTestCase;
use Tests\Concerns\InteractsWithMeilisearch;

/**
 * TCK-633 (lot E, AC6) — les mêmes filtres rendent le même compte en liste et en carte.
 *
 * `/search` interroge Meilisearch (`PropertySearchService::buildFilter()`), `/map` interroge
 * PostgreSQL (ADR-0023, `FiltresDeLaCarte`) : deux traductions du même vocabulaire. La carte ne
 * recevait que le type, la transaction, le prix et le rayon — un visiteur qui posait « 3 chambres,
 * meublé, à Dakar » voyait en carte des biens que la liste venait d'écarter.
 *
 * Le patron est celui de `SavedSearchCriteriaVocabularyTest` : deux biens qui ne diffèrent QUE par
 * la clé éprouvée, la liste et la carte doivent rendre le même bien, et le témoin sans la clé rend
 * les deux des deux côtés. `test_chaque_cle_de_la_carte_a_sa_ligne` rougit sur toute clé acceptée
 * par la carte sans ligne ici : une clé ajoutée à la liste ne peut pas rester ignorée en silence.
 *
 * Les critères sont des CHAÎNES, comme les écrit le front (`type=house,villa`, `furnished=false`).
 * `featured` vaut `false` par défaut : les places réservées du lot F ne brouillent pas les
 * ensembles. Les dates sont relatives (calculées en PHP pur, le provider tourne hors application).
 */
class MapFiltersParityTest extends ApiTestCase
{
    use InteractsWithMeilisearch;
    use RefreshDatabase;

    private const CADRAGE = '14.0,-18.0,15.5,-16.5';

    private const POINT = ['lat' => '14.7', 'lng' => '-17.45', 'radius_km' => '3'];

    /** Le point et son rayon voyagent ensemble : un témoin qui n'en retirerait qu'un rendrait 422. */
    private const CLES_DU_POINT = ['lat', 'lng', 'radius_km'];

    private const BASE = [
        'title' => 'Villa avec piscine',
        'description' => 'Belle maison lumineuse.',
        'type' => 'villa',
        'contract_type' => 'rent',
        'rent_period' => 'monthly',
        'price' => 200_000,
        'bedrooms' => 3,
        'bathrooms' => 2,
        'area' => 120,
        'furnished' => true,
        'featured' => false,
        'floor_number' => 2,
        'title_type' => 'titre_foncier',
        'condition' => 'new',
    ];

    private const BASE_ADDRESS = ['city' => 'Dakar', 'neighborhood' => 'Almadies', 'latitude' => 14.7, 'longitude' => -17.45];

    /**
     * [clé, critères, écart de B, écart d'adresse de B, tag porté par A, bien retenu].
     *
     * ⚠ Pour une clé multi-valuée, A porte la SECONDE valeur : une liste réduite à son premier
     * élément l'écarterait.
     *
     * @return array<string, array{0: string, 1: array<string, string>, 2: array<string, mixed>, 3: array<string, mixed>, 4: ?string, 5: string}>
     */
    public static function cles(): array
    {
        return [
            'location' => ['location', ['location' => 'Almadies'], [], ['neighborhood' => 'Médina'], null, 'A'],
            'city' => ['city', ['city' => 'Dakar'], [], ['city' => 'Thiès'], null, 'A'],
            'price_min' => ['price_min', ['price_min' => '150000'], ['price' => 100_000], [], null, 'A'],
            'price_max' => ['price_max', ['price_max' => '300000'], ['price' => 400_000], [], null, 'A'],
            'bedrooms' => ['bedrooms', ['bedrooms' => '3'], ['bedrooms' => 2], [], null, 'A'],
            'bathrooms' => ['bathrooms', ['bathrooms' => '2'], ['bathrooms' => 1], [], null, 'A'],
            'area_min' => ['area_min', ['area_min' => '100'], ['area' => 60], [], null, 'A'],
            'area_max' => ['area_max', ['area_max' => '150'], ['area' => 200], [], null, 'A'],
            'featured' => ['featured', ['featured' => 'true'], ['featured' => true], [], null, 'B'],
            'type' => ['type', ['type' => 'house,villa'], ['type' => 'apartment'], [], null, 'A'],
            'contract_type' => ['contract_type', ['contract_type' => 'rent'], ['contract_type' => 'sale', 'rent_period' => null], [], null, 'A'],
            'rent_period' => ['rent_period', ['rent_period' => 'monthly'], ['rent_period' => 'daily'], [], null, 'A'],
            'furnished oui' => ['furnished', ['furnished' => 'true'], ['furnished' => false], [], null, 'A'],
            'furnished non' => ['furnished', ['furnished' => 'false'], ['furnished' => false], [], null, 'B'],
            'tags' => ['tags', ['tags' => 'Piscine'], [], [], 'Piscine', 'A'],
            'lat' => ['lat', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null, 'A'],
            'lng' => ['lng', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null, 'A'],
            'radius_km' => ['radius_km', self::POINT, [], ['latitude' => 14.9, 'longitude' => -17.2], null, 'A'],
            'floor_number' => ['floor_number', ['floor_number' => '2'], ['floor_number' => 1], [], null, 'A'],
            'title_type' => ['title_type', ['title_type' => 'titre_foncier'], ['title_type' => 'bail'], [], null, 'A'],
            'condition' => ['condition', ['condition' => 'renovated,new'], ['condition' => 'good'], [], null, 'A'],
            'available_from' => ['available_from', ['available_from' => self::dansJours(30)], ['available_from' => self::dansJours(60)], [], null, 'A'],
        ];
    }

    public function test_la_carte_accepte_les_filtres_de_la_liste_et_eux_seuls(): void
    {
        $carte = array_keys((new MapPublicPropertyRequest)->rules());
        $liste = array_keys((new SearchPublicPropertyRequest)->rules());

        $this->assertEqualsCanonicalizing(
            array_values(array_diff($liste, MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE)),
            array_values(array_diff($carte, ['bounds'])),
        );
        $this->assertContains('bounds', $carte);
        foreach (['q', 'search', 'sort', 'page', 'per_page'] as $propre) {
            $this->assertNotContains($propre, $carte, "« {$propre} » reste propre à la liste");
        }
    }

    public function test_chaque_cle_de_la_carte_a_sa_ligne(): void
    {
        $this->assertEqualsCanonicalizing(
            array_values(array_diff(array_keys((new MapPublicPropertyRequest)->rules()), ['bounds'])),
            array_values(array_unique(array_column(self::cles(), 0))),
        );
    }

    /**
     * @param  array<string, string>  $criteres
     * @param  array<string, mixed>  $ecartB
     * @param  array<string, mixed>  $ecartAdresseB
     */
    #[DataProvider('cles')]
    public function test_la_carte_rend_ce_que_rend_la_liste(string $cle, array $criteres, array $ecartB, array $ecartAdresseB, ?string $tagA, string $retenu): void
    {
        $a = $this->bien([], [], $tagA);
        $b = $this->bien($ecartB, $ecartAdresseB, null);
        $this->indexProperties();

        $attendu = $retenu === 'A' ? [$a->id] : [$b->id];
        $this->assertSame($attendu, $this->idsDeLaListe($criteres), "« {$cle} » : la liste");
        $this->assertSame($attendu, $this->idsDeLaCarte($criteres), "« {$cle} » : la carte doit rendre ce que rend la liste");

        $retirees = in_array($cle, self::CLES_DU_POINT, true) ? self::CLES_DU_POINT : [$cle];
        $temoin = array_diff_key($criteres, array_flip($retirees));
        $deux = $this->tries([$a->id, $b->id]);
        $this->assertSame($deux, $this->idsDeLaListe($temoin), "témoin de « {$cle} » : la liste rend les deux");
        $this->assertSame($deux, $this->idsDeLaCarte($temoin), "témoin de « {$cle} » : la carte rend les deux");
    }

    public function test_la_carte_lit_les_chambres_comme_un_minimum(): void
    {
        $six = $this->bien(['bedrooms' => 6], [], null);
        $cinq = $this->bien(['bedrooms' => 5], [], null);
        $this->bien(['bedrooms' => 4], [], null);
        $this->indexProperties();

        $attendu = $this->tries([$six->id, $cinq->id]);
        $this->assertSame($attendu, $this->idsDeLaListe(['bedrooms' => '5']));
        $this->assertSame($attendu, $this->idsDeLaCarte(['bedrooms' => '5']));
    }

    /**
     * La casse d'une ville saisie à la main dans l'URL (`city=dakar`) : la carte doit la lire
     * comme la liste. Ce test ne fixe pas la règle, il fixe l'ACCORD — cf. Tâche 4, étape 4.6.
     */
    public function test_la_casse_de_la_ville_est_lue_comme_par_la_liste(): void
    {
        $this->bien([], [], null);
        $this->indexProperties();

        $this->assertSame($this->idsDeLaListe(['city' => 'dakar']), $this->idsDeLaCarte(['city' => 'dakar']));
    }

    private static function dansJours(int $jours): string
    {
        return date('Y-m-d', (int) strtotime("+{$jours} days"));
    }

    /**
     * @param  array<string, mixed>  $ecart
     * @param  array<string, mixed>  $ecartAdresse
     */
    private function bien(array $ecart, array $ecartAdresse, ?string $tag): Property
    {
        $bien = Property::factory()->published()->create([
            ...self::BASE,
            'available_from' => self::dansJours(10),
            ...$ecart,
            'published_at' => now()->subHour(),
        ]);
        Address::create([
            'addressable_type' => Property::class,
            'addressable_id' => $bien->id,
            'country' => 'SN',
            ...self::BASE_ADDRESS,
            ...$ecartAdresse,
        ]);
        if ($tag !== null) {
            $bien->tags()->attach(Tag::factory()->create(['name' => $tag, 'type' => TagType::Amenity]));
        }

        return $bien;
    }

    /**
     * Les ids de la liste — `data`, plus `sponsored` quand le lot F l'expose (hors pagination, et
     * soumis aux mêmes filtres : ADR-0061). L'union dédoublonne.
     *
     * @param  array<string, string>  $criteres
     * @return list<int>
     */
    private function idsDeLaListe(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/search?'.http_build_query([...$criteres, 'per_page' => 100]))->assertOk();

        return $this->tries(array_unique([
            ...array_column($reponse->json('data') ?? [], 'id'),
            ...array_column($reponse->json('sponsored') ?? [], 'id'),
        ]));
    }

    /**
     * @param  array<string, string>  $criteres
     * @return list<int>
     */
    private function idsDeLaCarte(array $criteres): array
    {
        $reponse = $this->getJson('/api/public/properties/map?'.http_build_query(['bounds' => self::CADRAGE, ...$criteres]))->assertOk();
        $ids = array_map(static fn (array $feature) => (int) $feature['properties']['id'], $reponse->json('features'));
        $this->assertSame(count($ids), $reponse->json('meta.returned'));

        return $this->tries($ids);
    }

    /**
     * @param  array<int, int|string>  $ids
     * @return list<int>
     */
    private function tries(array $ids): array
    {
        $ids = array_values(array_map('intval', $ids));
        sort($ids);

        return $ids;
    }
}
```

**Étape 3.2 — le voir échouer (structure seulement)**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/MapFiltersParityTest.php --filter='accepte_les_filtres|a_sa_ligne')
```

Attendu : **2 rouges** — `Error: Undefined constant …MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE`
pour le premier ; pour le second, l'ensemble attendu ne contient que `type, contract_type, price_min,
price_max, lat, lng, radius_km`.

**Étape 3.3 — réécrire `MapPublicPropertyRequest.php` (fichier du territoire, non co-tenu : Write)**

```php
<?php

namespace App\Http\Requests\Public;

/**
 * TCK-304/305 — extrait de PublicPropertyController::map(), ou les regles etaient inline.
 *
 * TCK-633 (lot E, AC6) — la carte HERITE des regles de la liste. Elle n'en acceptait que quatre
 * (type, transaction, prix) plus le rayon : tout autre filtre du panneau etait jete par
 * `validated()`, et la vue carte montrait des biens que la liste venait d'ecarter, sur le meme
 * ecran. Heriter plutot que recopier : une cle ajoutee a la liste arrive ici d'elle-meme, et
 * `MapFiltersParityTest` exige alors qu'elle soit appliquee par `FiltresDeLaCarte`.
 *
 * Herites tels quels : `authorize()` (true), `prepareForValidation()` (`furnished`/`featured`
 * en booleen, `available_from` ecretee au present) et le contrat « point + rayon »
 * (`FiltreParPointEtRayon`, ADR-0023, TCK-346).
 */
class MapPublicPropertyRequest extends SearchPublicPropertyRequest
{
    /**
     * Les cles de la LISTE qui n'ont pas de sens sur la carte :
     *
     * - `q`, `search` : la recherche plein-texte passe par Meilisearch ; `/map` est SQL (ADR-0023),
     *   et recomposer Scout + Eloquent ici creerait un second chemin, ce que `takussan-api/CLAUDE.md`
     *   (§ Recherche) interdit ;
     * - `sort` : decision motivee dans `PublicPropertyController::map()` (`PropertyMapRadiusTest::
     *   test_map_ne_declare_aucun_tri`) ;
     * - `page`, `per_page` : la carte est un GeoJSON plafonne, sans pagination ;
     * - `lat_min` … `lng_max` : le rectangle de la liste ; la carte a le sien, `bounds`.
     *
     * ⚠ Miroir de `CLES_PROPRES_A_LA_LISTE` dans `takussan-web/src/lib/recherche-publique.ts` :
     * `search-filters.parity.test.ts` compare les deux listes.
     */
    public const CLES_PROPRES_A_LA_LISTE = ['q', 'search', 'sort', 'page', 'per_page', 'lat_min', 'lat_max', 'lng_min', 'lng_max'];

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'bounds' => [
                'required',
                'string',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $parts = explode(',', (string) $value);
                    if (count($parts) !== 4) {
                        $fail(__('validation.bounds_format'));

                        return;
                    }
                    foreach ($parts as $p) {
                        if (! is_numeric(trim($p))) {
                            $fail(__('validation.bounds_format'));

                            return;
                        }
                    }
                    [$swLat, $swLng, $neLat, $neLng] = array_map('floatval', $parts);
                    if ($swLat < -90 || $swLat > 90 || $neLat < -90 || $neLat > 90
                        || $swLng < -180 || $swLng > 180 || $neLng < -180 || $neLng > 180) {
                        $fail(__('validation.bounds_format'));
                    }
                },
            ],

            // Le rayon se CONJOINT (ET) au rectangle `bounds`, exactement comme il se conjoint au
            // `_geoBoundingBox` de `/search`. `bounds` reste `required` : la carte demande toujours
            // un cadrage, le rayon ne le remplace pas.
            ...array_diff_key(parent::rules(), array_flip(self::CLES_PROPRES_A_LA_LISTE)),
        ];
    }
}
```

**Étape 3.4 — vert, et rien de cassé sur la carte**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/MapFiltersParityTest.php --filter='accepte_les_filtres|a_sa_ligne' && php artisan test tests/Feature/Public/PropertyMapTest.php tests/Feature/Public/PropertyMapRadiusTest.php)
```

Attendu : `accepte_les_filtres` vert, `a_sa_ligne` vert (le provider couvre les 21 clés) ;
`PropertyMapTest` et `PropertyMapRadiusTest` verts — dont `test_map_ne_declare_aucun_tri`.

**Étape 3.5 — ablation** : sauvegarder `MapPublicPropertyRequest.php` (+ `md5`), retirer `'sort'` de
`CLES_PROPRES_A_LA_LISTE` (Edit), lancer
`php artisan test tests/Feature/Search/MapFiltersParityTest.php --filter=accepte_les_filtres tests/Feature/Public/PropertyMapRadiusTest.php`
→ attendu : **2 rouges** (`« sort » reste propre à la liste`, `test_map_ne_declare_aucun_tri`).
Restaurer par `cp`, prouver par `md5`.

**Étape 3.6 — signaler à la session** : `MapPublicPropertyRequest.php`, `MapFiltersParityTest.php` —
`feat(api): la carte accepte tous les filtres de la liste (TCK-633)`.

---

## Tâche 4 — la carte applique chaque filtre, comme la liste (`FiltresDeLaCarte`)

**Files:**
- Create: `takussan-api/app/Services/Search/FiltresDeLaCarte.php`
- Modify (co-tenu C/F, **hors territoire** — Tâche 0, étape 0.7) : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php`
- Test: `takussan-api/tests/Feature/Search/MapFiltersParityTest.php` (écrit en Tâche 3)

**Étape 4.1 — le voir échouer**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/MapFiltersParityTest.php)
```

Attendu : rouges sur `test_la_carte_rend_ce_que_rend_la_liste` pour **toutes les clés sauf**
`type`, `contract_type`, `price_min`, `price_max`, `lat`, `lng`, `radius_km` (message « la carte
doit rendre ce que rend la liste », la carte rendant A et B) ; rouge sur
`test_la_carte_lit_les_chambres_comme_un_minimum` ; `test_la_casse_de_la_ville…` rouge si la liste
rend un bien pour `dakar`.

**Étape 4.2 — créer `FiltresDeLaCarte.php`**

```php
<?php

namespace App\Services\Search;

use App\Support\CaseInsensitive;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * TCK-633 (lot E, AC6) — les filtres du panneau, traduits en SQL pour `/map`.
 *
 * `/map` interroge PostgreSQL (ADR-0023 : GeoJSON plafonné, cadrage `bounds`), la liste interroge
 * Meilisearch (`PropertySearchService::buildFilter()`). Ce sont deux traductions du MÊME
 * vocabulaire, et chaque règle ci-dessous reprend celle de `buildFilter()` :
 *
 * - chambres, salles de bain, étage : des MINIMUMS ; une valeur nulle ne satisfait aucun seuil ;
 * - `featured` : unilatéral, `featured=false` ne filtre rien ;
 * - `type`, `condition`, `tags` : OU entre les valeurs d'une même clé ;
 * - `available_from` : un bien sans date est disponible ;
 * - ville et quartier : égalité sur le texte de l'adresse, qui porte le nom canonique du
 *   référentiel (ADR-0062 §4), repliée comme Meilisearch replie la casse (`CaseInsensitive`,
 *   ADR-0025 — accents NON repliés).
 *
 * Ce qu'elle ne fait PAS : `q` (plein-texte), le tri, la pagination — propres à la liste
 * (`MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE`). Le point et le rayon restent dans le
 * contrôleur, qui les compose au cadrage.
 *
 * L'accord est GARDÉ, pas supposé : `MapFiltersParityTest` pose deux biens qui ne diffèrent que
 * par une clé et exige le même résultat des deux côtés, pour chaque clé que la carte accepte.
 */
final class FiltresDeLaCarte
{
    /** Clé de la requête → colonne de `properties`, comparée en « au moins ». */
    private const MINIMUMS = [
        'bedrooms' => 'bedrooms',
        'bathrooms' => 'bathrooms',
        'floor_number' => 'floor_number',
    ];

    /**
     * @param  Builder<\App\Models\Property>  $query
     * @param  array<string, mixed>  $p  les paramètres VALIDÉS par `MapPublicPropertyRequest`
     */
    public function appliquer(Builder $query, array $p): void
    {
        if (! empty($p['location'])) {
            $this->adresseEgale($query, 'neighborhood', (string) $p['location']);
        }
        if (! empty($p['city'])) {
            $this->adresseEgale($query, 'city', (string) $p['city']);
        }
        if (isset($p['price_min']) && is_numeric($p['price_min'])) {
            $query->where($query->qualifyColumn('price'), '>=', (float) $p['price_min']);
        }
        if (isset($p['price_max']) && is_numeric($p['price_max'])) {
            $query->where($query->qualifyColumn('price'), '<=', (float) $p['price_max']);
        }
        foreach (self::MINIMUMS as $cle => $colonne) {
            if (isset($p[$cle]) && is_numeric($p[$cle])) {
                $query->where($query->qualifyColumn($colonne), '>=', (int) $p[$cle]);
            }
        }
        if (isset($p['area_min']) && is_numeric($p['area_min'])) {
            $query->where($query->qualifyColumn('area'), '>=', (float) $p['area_min']);
        }
        if (isset($p['area_max']) && is_numeric($p['area_max'])) {
            $query->where($query->qualifyColumn('area'), '<=', (float) $p['area_max']);
        }
        if (array_key_exists('featured', $p) && filter_var($p['featured'], FILTER_VALIDATE_BOOLEAN)) {
            $query->where($query->qualifyColumn('featured'), true);
        }
        if (! empty($p['title_type'])) {
            $query->where($query->qualifyColumn('title_type'), (string) $p['title_type']);
        }
        $this->parmi($query, 'condition', $p['condition'] ?? null);
        $this->parmi($query, 'type', $p['type'] ?? null);
        if (! empty($p['contract_type'])) {
            $query->where($query->qualifyColumn('contract_type'), (string) $p['contract_type']);
        }
        if (! empty($p['rent_period'])) {
            $query->where($query->qualifyColumn('rent_period'), (string) $p['rent_period']);
        }
        if (array_key_exists('furnished', $p) && $p['furnished'] !== null && $p['furnished'] !== '') {
            $query->where($query->qualifyColumn('furnished'), filter_var($p['furnished'], FILTER_VALIDATE_BOOLEAN));
        }
        $this->equipements($query, $p['tags'] ?? null);
        if (! empty($p['available_from'])) {
            $date = Carbon::parse((string) $p['available_from'])->toDateString();
            $colonne = $query->qualifyColumn('available_from');
            $query->where(fn (Builder $q) => $q->whereNull($colonne)->orWhereDate($colonne, '<=', $date));
        }
    }

    /** @param  Builder<\App\Models\Property>  $query */
    private function adresseEgale(Builder $query, string $colonne, string $valeur): void
    {
        $query->whereHas('address', fn (Builder $q) => $q->whereRaw(
            CaseInsensitive::sql($colonne).' = ?',
            [CaseInsensitive::fold($valeur)],
        ));
    }

    /** @param  Builder<\App\Models\Property>  $query */
    private function parmi(Builder $query, string $colonne, mixed $brut): void
    {
        $valeurs = self::valeurs($brut);
        if ($valeurs !== []) {
            $query->whereIn($query->qualifyColumn($colonne), $valeurs);
        }
    }

    /** @param  Builder<\App\Models\Property>  $query */
    private function equipements(Builder $query, mixed $brut): void
    {
        $noms = array_map(static fn (string $nom) => CaseInsensitive::fold($nom), self::valeurs($brut));
        if ($noms === []) {
            return;
        }
        $marques = implode(', ', array_fill(0, count($noms), '?'));
        $query->whereHas('tags', fn (Builder $q) => $q->whereRaw(
            CaseInsensitive::sql('tags.name')." in ({$marques})",
            $noms,
        ));
    }

    /** @return list<string> */
    private static function valeurs(mixed $brut): array
    {
        if ($brut === null || $brut === '') {
            return [];
        }
        $liste = is_array($brut) ? $brut : explode(',', (string) $brut);

        return array_values(array_filter(
            array_map(static fn ($v) => trim((string) $v), $liste),
            static fn (string $v) => $v !== '',
        ));
    }
}
```

**Étape 4.3 — encore rouge (classe non branchée)** : relancer l'étape 4.1, attendu identique.

**Étape 4.4 — brancher dans `map()` (Edit, deux blocs + un import)** — uniquement si l'étape 0.7
l'autorise.

Import : remplacer

```php
use App\Services\Search\PropertySearchService;
```

par

```php
use App\Services\Search\FiltresDeLaCarte;
use App\Services\Search\PropertySearchService;
```

Signature : remplacer

```php
    public function map(MapPublicPropertyRequest $request): JsonResponse
```

par

```php
    public function map(MapPublicPropertyRequest $request, FiltresDeLaCarte $filtres): JsonResponse
```

Corps : remplacer

```php
        if (! empty($validated['type'])) {
            $types = array_filter(explode(',', $validated['type']));
            $query->whereIn('type', $types);
        }
        if (! empty($validated['contract_type'])) {
            $query->where('contract_type', $validated['contract_type']);
        }
        if (isset($validated['price_min'])) {
            $query->where('price', '>=', $validated['price_min']);
        }
        if (isset($validated['price_max'])) {
            $query->where('price', '<=', $validated['price_max']);
        }
```

par

```php
        // TCK-633 (lot E, AC6) — TOUS les filtres du panneau, traduits en SQL par une seule
        // classe : la carte rend le compte de la liste (`MapFiltersParityTest`). Le plein-texte,
        // le tri et la pagination restent propres à la liste.
        $filtres->appliquer($query, $validated);
```

**Étape 4.5 — vert**

```bash
(cd takussan-api && php artisan test tests/Feature/Search/MapFiltersParityTest.php tests/Feature/Public/PropertyMapTest.php tests/Feature/Public/PropertyMapRadiusTest.php)
```

Attendu : 0 échec (`MapFiltersParityTest` : 2 structurels + 22 jeux + 2 = 26 tests).

**Étape 4.6 — si `test_la_casse_de_la_ville_est_lue_comme_par_la_liste` rougit, et seulement alors**

Le message dit lequel des deux côtés rend un bien. Liste `[]`, carte `[id]` : Meilisearch compare
la casse strictement ; remplacer alors le corps de `adresseEgale()` par
`$query->whereHas('address', fn (Builder $q) => $q->where($colonne, $valeur));` et écrire la mesure au
rapport (`ecarts_au_ticket`). Liste `[id]`, carte `[]` : c'est la classe qui est fautive (repli
manquant) — ne pas changer le test. Dans les deux cas, relancer l'étape 4.5.

**Étape 4.7 — ablations (deux)**

```bash
ABL=<scratchpad>/ablations-lot-e; mkdir -p "$ABL"
cp takussan-api/app/Services/Search/FiltresDeLaCarte.php "$ABL/FiltresDeLaCarte.php"; md5 -q takussan-api/app/Services/Search/FiltresDeLaCarte.php | tee "$ABL/FiltresDeLaCarte.md5"
cp takussan-api/app/Http/Controllers/Public/PublicPropertyController.php "$ABL/PublicPropertyController.php"; md5 -q takussan-api/app/Http/Controllers/Public/PublicPropertyController.php | tee "$ABL/PublicPropertyController.md5"
```

A. Dans `FiltresDeLaCarte::appliquer()`, remplacer (Edit) dans la boucle des minimums `'>='` par
`'='`. Lancer
`php artisan test tests/Feature/Search/MapFiltersParityTest.php --filter=minimum` → **1 rouge**.
Restaurer par `cp`, `md5` identique.

B. Dans `map()`, remplacer (Edit) `$filtres->appliquer($query, $validated);` par
`// ablation`. Lancer `php artisan test tests/Feature/Search/MapFiltersParityTest.php` → rouges sur
**toutes** les clés du provider sauf `lat`, `lng`, `radius_km` (dont `type`, `contract_type`, prix :
le bloc d'origine a disparu). Restaurer par `cp`, `md5` identique.

**Étape 4.8 — Pint et sélection d'impact**

```bash
(cd takussan-api && ./vendor/bin/pint app/Services/Search/FiltresDeLaCarte.php app/Http/Requests/Public/MapPublicPropertyRequest.php app/Http/Controllers/Public/PublicPropertyController.php app/Services/Search/PropertySearchService.php tests/Feature/Search/MapFiltersParityTest.php tests/Feature/Search/SearchMinimumFiltersTest.php && php bin/impacted-tests.php --run)
```

Attendu : Pint `PASS` ou fichiers corrigés ; la sélection d'impact verte. Si elle répond
`SUITE ENTIÈRE`, ne **pas** la lancer : lancer les classes de la carte des fichiers et le noter.

**Étape 4.9 — signaler à la session** : `FiltresDeLaCarte.php`, `PublicPropertyController.php` (co-tenu,
bloc `map()` seul) — `feat(api): la carte applique tous les filtres de la liste (TCK-633)`.

---

## Tâche 5 — `parametresDeLaCarte` et la parité front ↔ PHP

**Files:**
- Modify: `takussan-web/src/lib/recherche-publique.ts`
- Create: `takussan-web/src/lib/__tests__/recherche-publique.carte.test.ts`
- Modify: `takussan-web/src/types/__tests__/search-filters.parity.test.ts`

**Étape 5.1 — tests qui échouent**

`src/lib/__tests__/recherche-publique.carte.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { CLES_PROPRES_A_LA_LISTE, parametresDeLaCarte } from '../recherche-publique';

/**
 * TCK-633 (lot E, AC6) — la carte reçoit TOUS les filtres du panneau, dérivés de la même URL que
 * la liste. Elle n'en recevait que sept, recopiés à la main dans `PropertiesDiscoveryPage` : tout
 * filtre ajouté au panneau en était absent, et la vue carte rendait un autre compte que la liste.
 */
describe('TCK-633 — parametresDeLaCarte', () => {
  it('garde chaque filtre du panneau, tel que l’URL l’écrit', () => {
    const url = new URLSearchParams(
      'city=Dakar&location=Almadies&type=house%2Cvilla&contract_type=rent&rent_period=monthly'
        + '&price_min=1&price_max=2&bedrooms=5&bathrooms=2&area_min=40&area_max=300&furnished=false'
        + '&featured=true&floor_number=0&available_from=2026-11-01&title_type=bail&condition=new'
        + '&tags=Piscine%2CParking',
    );

    expect(parametresDeLaCarte(url)).toEqual({
      city: 'Dakar',
      location: 'Almadies',
      type: 'house,villa',
      contract_type: 'rent',
      rent_period: 'monthly',
      price_min: '1',
      price_max: '2',
      bedrooms: '5',
      bathrooms: '2',
      area_min: '40',
      area_max: '300',
      furnished: 'false',
      featured: 'true',
      floor_number: '0',
      available_from: '2026-11-01',
      title_type: 'bail',
      condition: 'new',
      tags: 'Piscine,Parking',
    });
  });

  it('retire q, search, le tri, la pagination et le rectangle de la liste', () => {
    const url = new URLSearchParams(
      'q=villa&search=villa&sort=price_asc&page=3&per_page=70&lat_min=1&lat_max=2&lng_min=3&lng_max=4&city=Dakar',
    );
    expect(parametresDeLaCarte(url)).toEqual({ city: 'Dakar' });
  });

  it('garde le point avec son rayon, et rien d’un point incomplet', () => {
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&lng=-17.45&radius_km=3'))).toEqual({
      lat: '14.7',
      lng: '-17.45',
      radius_km: '3',
    });
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&radius_km=3'))).toEqual({});
  });

  it('un point SANS rayon ne part pas : il ne servait qu’au tri par distance, propre à la liste', () => {
    expect(parametresDeLaCarte(new URLSearchParams('lat=14.7&lng=-17.45&sort=distance'))).toEqual({});
  });

  it('n’envoie aucune valeur vide', () => {
    expect(parametresDeLaCarte(new URLSearchParams('city=&type=villa'))).toEqual({ type: 'villa' });
  });

  it('ne mute pas les paramètres reçus', () => {
    const url = new URLSearchParams('q=villa&city=Dakar');
    parametresDeLaCarte(url);
    expect(url.toString()).toBe('q=villa&city=Dakar');
  });

  it('les clés propres à la liste sont celles du contrat', () => {
    expect([...CLES_PROPRES_A_LA_LISTE]).toEqual([
      'q', 'search', 'sort', 'page', 'per_page', 'lat_min', 'lat_max', 'lng_min', 'lng_max',
    ]);
  });
});
```

`src/types/__tests__/search-filters.parity.test.ts` — Edit 1 : remplacer

```ts
import { CLES_DE_RECHERCHE, SEARCH_FILTER_KEYS } from '../search';
```

par

```ts
import { CLES_DE_RECHERCHE, SEARCH_FILTER_KEYS } from '../search';
import { CLES_PROPRES_A_LA_LISTE } from '../../lib/recherche-publique';
```

Edit 2 : remplacer

```ts
const SERVICE = join(RACINE, 'takussan-api', 'app', 'Services', 'Search', 'PropertySearchService.php');
```

par

```ts
const SERVICE = join(RACINE, 'takussan-api', 'app', 'Services', 'Search', 'PropertySearchService.php');
const REQUETE_CARTE = join(RACINE, 'takussan-api', 'app', 'Http', 'Requests', 'Public', 'MapPublicPropertyRequest.php');
```

Edit 3 : ajouter en **fin de fichier** (ancre : la dernière ligne `});` du fichier, précédée du
dernier `it(` du describe TCK-346 — relire la fin du fichier et insérer après elle) :

```ts

/**
 * TCK-633 (lot E, AC6) — ce que la carte NE reçoit pas est écrit deux fois : dans
 * `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` (ce qu'elle refuse) et dans
 * `lib/recherche-publique.ts` (ce que le front retire). Deux listes qui doivent coïncider.
 */
describe('TCK-633 — la carte et la liste s’accordent sur ce qui est propre à la liste', () => {
  it('CLES_PROPRES_A_LA_LISTE est la même des deux côtés', () => {
    const php = readFileSync(REQUETE_CARTE, 'utf8');
    const bloc = php.match(/CLES_PROPRES_A_LA_LISTE\s*=\s*\[([^\]]*)\]/);
    expect(bloc, 'constante introuvable dans MapPublicPropertyRequest.php').not.toBeNull();
    const back = [...bloc![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect([...CLES_PROPRES_A_LA_LISTE].sort()).toEqual([...back].sort());
  });

  it('toute clé du panneau qui part vers la carte est acceptée par la liste, dont la carte hérite', () => {
    const propres = new Set<string>(CLES_PROPRES_A_LA_LISTE);
    const back = new Set(clesDuBack());
    const refusees = clesDuFront().filter((cle) => !propres.has(cle) && !back.has(cle));
    expect(refusees).toEqual([]);
  });
});
```

**Étape 5.2 — rouge**

```bash
(cd takussan-web && npx vitest run src/lib/__tests__/recherche-publique.carte.test.ts src/types/__tests__/search-filters.parity.test.ts)
```

Attendu : échec d'import — `parametresDeLaCarte` / `CLES_PROPRES_A_LA_LISTE` non exportés
(`does not provide an export named`).

**Étape 5.3 — implémentation** : dans `src/lib/recherche-publique.ts`, Edit — ancre : la fin de
`parametresDeRecherche`

```ts
  if (!params.has('per_page')) params.set('per_page', String(PER_PAGE_PAR_DEFAUT));

  return params;
}
```

remplacée par

```ts
  if (!params.has('per_page')) params.set('per_page', String(PER_PAGE_PAR_DEFAUT));

  return params;
}

/**
 * TCK-633 (lot E, AC6) — les clés que la LISTE lit et que la CARTE refuse : le plein-texte (la
 * carte est SQL, ADR-0023), le tri, la pagination et le rectangle de la liste.
 *
 * ⚠ Miroir de `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` (PHP) :
 * `search-filters.parity.test.ts` compare les deux listes.
 */
export const CLES_PROPRES_A_LA_LISTE = [
  'q', 'search', 'sort', 'page', 'per_page', 'lat_min', 'lat_max', 'lng_min', 'lng_max',
] as const;

/**
 * Les paramètres d'URL de `/properties` traduits pour `/map` — TOUS les filtres du panneau, et
 * eux seuls.
 *
 * Part de {@link parametresDeRecherche} (même normalisation géographique que la liste), retire
 * {@link CLES_PROPRES_A_LA_LISTE}, et un point sans rayon : sans `radius_km`, `lat`/`lng` ne
 * servaient qu'au tri par distance. Les valeurs vides ne partent pas. Les clés multi-valuées
 * voyagent sous leur forme d'URL, jointes par des virgules (`type=house,villa`) : c'est celle
 * qu'écrit `filtersToParams`, et celle que lit l'API.
 */
export function parametresDeLaCarte(brut: URLSearchParams): Record<string, string> {
  const params = parametresDeRecherche(brut);
  for (const cle of CLES_PROPRES_A_LA_LISTE) params.delete(cle);
  if (!params.has('radius_km')) {
    params.delete('lat');
    params.delete('lng');
  }

  const carte: Record<string, string> = {};
  params.forEach((valeur, cle) => {
    if (valeur !== '') carte[cle] = valeur;
  });
  return carte;
}
```

**Étape 5.4 — vert**

```bash
(cd takussan-web && npx vitest run src/lib/__tests__/recherche-publique.carte.test.ts src/types/__tests__/search-filters.parity.test.ts src/lib/__tests__/recherche-publique.test.ts)
```

Attendu : tout vert (la parité PHP lit la constante écrite en Tâche 3).

**Étape 5.5 — ablation** : sauvegarder `recherche-publique.ts` (+ `md5`), retirer `'sort', ` de la
constante TS ; relancer les deux fichiers → **2 rouges** (« clés propres … contrat » et « la même
des deux côtés »). Restaurer par `cp`, `md5` identique.

**Étape 5.6 — signaler à la session** : les trois fichiers —
`feat(web): paramètres de la carte dérivés de l'URL de la liste (TCK-633)`.

---

## Tâche 6 — la carte reçoit tous les filtres (`PropertiesDiscoveryPage`)

**Files:**
- Modify (co-tenu E/F, Edit) : `takussan-web/src/components/property/PropertiesDiscoveryPage.tsx`
- Modify: `takussan-web/src/components/property/__tests__/PropertiesDiscoveryPage.carte-geo.test.tsx`

**Étape 6.1 — tests d'abord** (Edit sur `carte-geo.test.tsx`)

Remplacer

```ts
    expect(filtres).toMatchObject({ lat: 14.7, lng: -17.45, radius_km: 3 });
```

par

```ts
    // TCK-633 — sous leur forme d'URL : la carte reçoit les paramètres de la liste, pas des nombres.
    expect(filtres).toMatchObject({ lat: '14.7', lng: '-17.45', radius_km: '3' });
```

Puis ajouter, avant la dernière ligne `});` du fichier (fin du describe TCK-346), un describe
frère placé **après** elle :

```ts

/**
 * TCK-633 (lot E, AC6) — la carte reçoit TOUS les filtres du panneau. Elle n'en recevait que sept,
 * recopiés à la main : chambres, ville, meublé, équipements… disparaissaient à la bascule en vue
 * carte, et la carte comptait des biens que la liste venait d'écarter.
 */
describe('TCK-633 — la vue carte reçoit tous les filtres de la liste', () => {
  it('transmet chaque filtre du panneau, jamais q, le tri ni la pagination', async () => {
    parametres = new URLSearchParams(
      'q=villa&city=Dakar&location=Almadies&type=house,villa&bedrooms=5&bathrooms=2&furnished=false'
        + '&tags=Piscine&floor_number=0&condition=new&sort=price_asc&page=2&per_page=60',
    );

    const filtres = await basculerEnVueCarte();

    expect(filtres).toEqual({
      city: 'Dakar',
      location: 'Almadies',
      type: 'house,villa',
      bedrooms: '5',
      bathrooms: '2',
      furnished: 'false',
      tags: 'Piscine',
      floor_number: '0',
      condition: 'new',
    });
  });
});
```

**Étape 6.2 — rouge**

```bash
(cd takussan-web && npx vitest run src/components/property/__tests__/PropertiesDiscoveryPage.carte-geo.test.tsx)
```

Attendu : **2 rouges** — `lat` reçu en nombre (`14.7` ≠ `'14.7'`), et l'objet réduit à
`{ type, … }` sans `city`, `bedrooms`, etc.

**Étape 6.3 — implémentation (Edit, deux blocs)**

Import : remplacer

```ts
import { filtersToParams, useSearch, type GraineDeRecherche } from '@/hooks/useSearch';
```

par

```ts
import { filtersToParams, useSearch, type GraineDeRecherche } from '@/hooks/useSearch';
import { parametresDeLaCarte } from '@/lib/recherche-publique';
```

Bloc : remplacer

```ts
  // Derive the map filters from the active search filters. We only forward
  // the subset that the backend's `/map` endpoint supports.
  //
```

par

```ts
  // TCK-633 (lot E, AC6) — la carte reçoit TOUS les filtres du panneau, dérivés de la même URL que
  // la liste (`parametresDeLaCarte`) : un filtre ajouté au panneau n'a plus à être recopié ici.
  // Restent à la liste seule `q`, le tri, la pagination et son rectangle.
  //
```

et remplacer

```ts
  const mapFilters: Record<string, string | number | undefined> = {
    type: filters.type?.join(','),
    contract_type: filters.contract_type,
    price_min: filters.price_min,
    price_max: filters.price_max,
    lat: filters.lat,
    lng: filters.lng,
    radius_km: filters.radius_km,
  };
```

par

```ts
  const mapFilters = parametresDeLaCarte(filtersToParams(filters));
```

**Étape 6.4 — vert**

```bash
(cd takussan-web && npx vitest run src/components/property/__tests__/PropertiesDiscoveryPage.carte-geo.test.tsx src/components/property/__tests__)
```

Attendu : tout vert (les cinq tests de `carte-geo`, dont « ne transmet pas le tri »).

**Étape 6.5 — ablation** : sauvegarder la page (+ `md5`), remettre par Edit l'ancien objet
`mapFilters` (bloc remplacé ci-dessus) ; relancer `carte-geo` → **2 rouges** (étape 6.2). Restaurer
par `cp`, `md5` identique.

**Étape 6.6 — signaler à la session** : la page (co-tenue, deux blocs) et le test —
`feat(web): la vue carte reçoit tous les filtres du panneau (TCK-633)`.

---

## Tâche 7 — les libellés (`search.filters.*`, fr / en / wo)

**Files:** Modify (co-tenus, Edit) `takussan-web/src/messages/fr.json`, `en.json`, `wo.json`.

Une Edit par langue, ancrée sur le bloc `floors` de `search.filters` (unique dans chaque fichier :
`grep -c '"fourthPlus"'` → 1). Les valeurs d'étage sont **re-libellées** (l'étage devient un
minimum : « 4e+ » voulait déjà dire « au moins », les quatre autres non) ; les clés neuves sont
insérées juste après, avant `"titleDeedHint"`.

**fr.json** — remplacer

```json
        "ground": "RDC",
        "first": "1er",
        "second": "2e",
        "third": "3e",
        "fourthPlus": "4e+"
      },
```

par

```json
        "ground": "RDC et +",
        "first": "1er et +",
        "second": "2e et +",
        "third": "3e et +",
        "fourthPlus": "4e et +"
      },
      "transaction": {
        "rent": "Louer",
        "sale": "Acheter"
      },
      "chips": {
        "bedroomsMin": "{n}+ ch.",
        "bathroomsMin": "{n}+ sdb",
        "groundFloorMin": "RDC et +",
        "firstFloorMin": "1er étage et +",
        "floorMin": "{n}e étage et +"
      },
      "furnished": {
        "title": "Meublé",
        "any": "Indifférent",
        "yes": "Oui",
        "no": "Non"
      },
      "place": {
        "city": "Ville",
        "cityPlaceholder": "Choisir une ville",
        "noCity": "Aucune ville ne correspond",
        "clearCity": "Retirer la ville",
        "quarter": "Quartier",
        "quarterPlaceholder": "Choisir un quartier",
        "quarterNeedsCity": "Choisissez d’abord une ville",
        "noQuarter": "Aucun quartier ne correspond",
        "clearQuarter": "Retirer le quartier"
      },
      "amenityPicker": {
        "placeholder": "Choisir des équipements",
        "empty": "Aucun équipement ne correspond",
        "hint": "Biens offrant au moins un des équipements choisis"
      },
      "more": {
        "show": "Plus de filtres",
        "showCount": "Plus de filtres ({count})",
        "hide": "Moins de filtres"
      },
```

**en.json** — remplacer

```json
        "ground": "Ground",
        "first": "1st",
        "second": "2nd",
        "third": "3rd",
        "fourthPlus": "4th+"
      },
```

par

```json
        "ground": "Ground+",
        "first": "1st+",
        "second": "2nd+",
        "third": "3rd+",
        "fourthPlus": "4th+"
      },
      "transaction": {
        "rent": "Rent",
        "sale": "Buy"
      },
      "chips": {
        "bedroomsMin": "{n}+ bd",
        "bathroomsMin": "{n}+ ba",
        "groundFloorMin": "Ground floor and up",
        "firstFloorMin": "1st floor and up",
        "floorMin": "Floor {n} and up"
      },
      "furnished": {
        "title": "Furnished",
        "any": "Any",
        "yes": "Yes",
        "no": "No"
      },
      "place": {
        "city": "City",
        "cityPlaceholder": "Choose a city",
        "noCity": "No matching city",
        "clearCity": "Remove the city",
        "quarter": "Neighbourhood",
        "quarterPlaceholder": "Choose a neighbourhood",
        "quarterNeedsCity": "Choose a city first",
        "noQuarter": "No matching neighbourhood",
        "clearQuarter": "Remove the neighbourhood"
      },
      "amenityPicker": {
        "placeholder": "Choose amenities",
        "empty": "No matching amenity",
        "hint": "Properties offering at least one of the chosen amenities"
      },
      "more": {
        "show": "More filters",
        "showCount": "More filters ({count})",
        "hide": "Fewer filters"
      },
```

**wo.json** — remplacer

```json
        "ground": "Suuf",
        "first": "1u",
        "second": "2u",
        "third": "3u",
        "fourthPlus": "4u+"
      },
```

par

```json
        "ground": "Suuf +",
        "first": "1u +",
        "second": "2u +",
        "third": "3u +",
        "fourthPlus": "4u +"
      },
      "transaction": {
        "rent": "Luwaa",
        "sale": "Jënd"
      },
      "chips": {
        "bedroomsMin": "{n}+ neeg",
        "bathroomsMin": "{n}+ sanjaan",
        "groundFloorMin": "Etaas bu suuf ak kaw",
        "firstFloorMin": "Etaas 1 ak kaw",
        "floorMin": "Etaas {n} ak kaw"
      },
      "furnished": {
        "title": "Meebal",
        "any": "Lu mu doon",
        "yes": "Waaw",
        "no": "Déedéet"
      },
      "place": {
        "city": "Dëkk",
        "cityPlaceholder": "Tànnal benn dëkk",
        "noCity": "Amul dëkk bu ko mel",
        "clearCity": "Dindi dëkk bi",
        "quarter": "Gox",
        "quarterPlaceholder": "Tànnal benn gox",
        "quarterNeedsCity": "Njëkkal tànn dëkk bi",
        "noQuarter": "Amul gox bu ko mel",
        "clearQuarter": "Dindi gox bi"
      },
      "amenityPicker": {
        "placeholder": "Tànnal ay jumtukaay",
        "empty": "Amul jumtukaay bu ko mel",
        "hint": "Kër yu am benn ci jumtukaay yi nga tànn"
      },
      "more": {
        "show": "Yeneen tànneef",
        "showCount": "Yeneen tànneef ({count})",
        "hide": "Tànneef yu néew"
      },
```

**Étape 7.1 — vérifier**

```bash
node -e 'for (const l of ["fr","en","wo"]) { const f = require(`./takussan-web/src/messages/${l}.json`).search.filters; console.log(l, f.transaction.rent, "|", f.chips.floorMin, "|", f.more.showCount, "|", f.floors.ground); }'
(cd takussan-web && npm run check:i18n)
```

Attendu : `fr Louer | {n}e étage et + | Plus de filtres ({count}) | RDC et +` (et les deux autres
langues) ; `check:i18n` vert (parité exacte, aucune clé neuve manquante en `en` ou `wo`).

**Étape 7.2 — signaler à la session** : les trois dictionnaires (sous `search.filters` seulement) —
avec la tâche qui les consomme en premier (Tâche 8).

---

## Tâche 8 — les puces actives disent « et plus »

**Files:**
- Modify: `takussan-web/src/types/search.ts` (libellés `bedrooms`, `bathrooms`, `floor_number`)
- Modify: `takussan-web/src/components/search/__tests__/SearchToolbar.test.tsx`

**Étape 8.1 — tests d'abord** (Edit sur `SearchToolbar.test.tsx`)

Dans le premier test, remplacer

```ts
      '3 ch.',
      '2 sdb',
```

par

```ts
      // TCK-633 — des MINIMUMS : la puce dit « et plus », comme le panneau.
      '3+ ch.',
      '2+ sdb',
```

remplacer (même test)

```ts
      '★ En vedette',
      'Rez-de-chaussée',
```

par

```ts
      '★ En vedette',
      'RDC et +',
```

Remplacer le test du rez-de-chaussée

```ts
  /** `floor_number: 0` est falsy : un `if (value)` le ferait disparaître silencieusement. */
  it('garde le rez-de-chaussée, que `0` rendrait falsy', () => {
    monte({ floor_number: 0 });
    expect(puces()).toEqual(['Rez-de-chaussée']);
  });
```

par

```ts
  /** `floor_number: 0` est falsy : un `if (value)` le ferait disparaître silencieusement. */
  it('garde le rez-de-chaussée, que `0` rendrait falsy', () => {
    monte({ floor_number: 0 });
    expect(puces()).toEqual(['RDC et +']);
  });

  /** TCK-633 — l'étage est un minimum, et le français accorde le premier étage à part. */
  it.each([
    [1, '1er étage et +'],
    [3, '3e étage et +'],
  ])('libelle l’étage %i en minimum', (etage, libelle) => {
    monte({ floor_number: etage });
    expect(puces()).toEqual([libelle]);
  });
```

**Étape 8.2 — rouge**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__/SearchToolbar.test.tsx)
```

Attendu : **4 rouges** (`'3 ch.'` reçu au lieu de `'3+ ch.'`, `'Rez-de-chaussée'`, `'Étage 1'`,
`'Étage 3'`).

**Étape 8.3 — implémentation (Edit, `types/search.ts`)**

Remplacer

```ts
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.bedrooms', { n: String(v) }),
```

par

```ts
    // TCK-633 — un MINIMUM côté API (`bedrooms >= n`) : la puce le dit.
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('filters.chips.bedroomsMin', { n: String(v) }),
```

Remplacer

```ts
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('tags.bathrooms', { n: String(v) }),
```

par

```ts
    libelle: (v: number, t: TraducteursDeFiltre) => t.tags('filters.chips.bathroomsMin', { n: String(v) }),
```

Remplacer

```ts
    libelle: (v: number, t: TraducteursDeFiltre) =>
      Number(v) === 0 ? t.tags('tags.groundFloor') : t.tags('tags.floor', { n: String(v) }),
```

par

```ts
    // TCK-633 — « 2e étage et + » : un minimum, et le premier étage s'accorde à part en français.
    libelle: (v: number, t: TraducteursDeFiltre) => {
      const etage = Number(v);
      if (etage === 0) return t.tags('filters.chips.groundFloorMin');
      if (etage === 1) return t.tags('filters.chips.firstFloorMin');
      return t.tags('filters.chips.floorMin', { n: String(etage) });
    },
```

**Étape 8.4 — vert**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__/SearchToolbar.test.tsx src/components/search/__tests__/criteres-de-recherche-sauvegardee.test.tsx src/types/__tests__)
```

Attendu : tout vert.

**Étape 8.5 — ablation** : sauvegarder `types/search.ts` (+ `md5`), remettre `'tags.bedrooms'` dans
le libellé `bedrooms` ; relancer `SearchToolbar.test.tsx` → **1 rouge** (`'3 ch.'`). Restaurer par
`cp`, `md5` identique.

**Étape 8.6 — signaler à la session** : `types/search.ts`, `SearchToolbar.test.tsx`, les trois
dictionnaires — `feat(web): puces de filtre en minimum et libellés du panneau (TCK-633)`.

---

## Tâche 9 — le panneau : « Louer » d'abord, minimums, étage, « Meublé » en trois états

**Files:**
- Create: `takussan-web/src/components/search/__tests__/FilterSidebar.lot-e.test.tsx`
- Modify: `takussan-web/src/components/search/FilterSidebar.tsx`
- Modify: `takussan-web/src/components/search/__tests__/FilterSidebar.test.tsx` (l. 123),
  `FilterSidebar.retour.test.tsx` (l. 151), `attente-des-puces.test.tsx` (l. 52, 57-60)

**Étape 9.1 — test qui échoue** (`FilterSidebar.lot-e.test.tsx`)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-633 (lot E) — retours du porteur du 2026-10-11 sur le panneau de filtres public.
 *
 * - « Louer » avant « Acheter », dans le vocabulaire de la barre (et non « Vente » / « Location ») ;
 * - chambres, salles de bain et étage sont des MINIMUMS : les puces le disent (« 5+ », « 2e et + ») ;
 * - « Meublé » a trois états : indifférent, oui, non — la bascule « Meublé uniquement » ne savait pas
 *   demander un logement vide.
 */

function monte(filters: SearchFilters = {}) {
  const onFilterChange = vi.fn();
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={vi.fn()}
        activeCount={0}
        open={false}
        onClose={() => {}}
      />,
    ),
  );
  return { onFilterChange };
}

/** Déplie « Plus de filtres » s'il existe et est replié (Tâche 12) ; sans effet avant. */
function deplier() {
  const bouton = screen.queryByRole('button', { name: /^Plus de filtres/ });
  if (bouton) fireEvent.click(bouton);
}

/** Les libellés des boutons d'une section, dans l'ordre du document. */
function boutonsDeLaSection(titre: string): string[] {
  const section = screen.getByRole('heading', { name: titre }).parentElement!;
  return within(section).getAllByRole('button').map((b) => b.textContent ?? '');
}

describe('TCK-633 — la transaction : « Louer » d’abord', () => {
  it('propose Louer puis Acheter, dans cet ordre', () => {
    monte();
    expect(boutonsDeLaSection('Type de transaction')).toEqual(['Louer', 'Acheter']);
  });

  it('« Louer » pose contract_type=rent', () => {
    const { onFilterChange } = monte();
    fireEvent.click(screen.getByRole('button', { name: 'Louer' }));
    expect(onFilterChange).toHaveBeenCalledWith({ contract_type: 'rent', rent_period: undefined, page: 1 });
  });
});

describe('TCK-633 — chambres, salles de bain et étage sont des minimums', () => {
  it('les chambres se lisent « 1+ » à « 5+ », et « 5+ » pose bedrooms=5', () => {
    const { onFilterChange } = monte();
    expect(boutonsDeLaSection('Chambres')).toEqual(['1+', '2+', '3+', '4+', '5+']);
    fireEvent.click(screen.getByRole('button', { name: '5+' }));
    expect(onFilterChange).toHaveBeenCalledWith({ bedrooms: 5, page: 1 });
  });

  it('les salles de bain se lisent « 1+ » à « 3+ »', () => {
    monte();
    deplier();
    expect(boutonsDeLaSection('Salles de bain')).toEqual(['1+', '2+', '3+']);
  });

  it('l’étage se lit « RDC et + » à « 4e et + », et « 2e et + » pose floor_number=2', () => {
    const { onFilterChange } = monte();
    deplier();
    expect(boutonsDeLaSection('Étage')).toEqual(['RDC et +', '1er et +', '2e et +', '3e et +', '4e et +']);
    fireEvent.click(screen.getByRole('button', { name: '2e et +' }));
    expect(onFilterChange).toHaveBeenCalledWith({ floor_number: 2, page: 1 });
  });
});

describe('TCK-633 — « Meublé » : indifférent, oui, non', () => {
  it('sans filtre, « Indifférent » est pressé', () => {
    monte();
    deplier();
    expect(boutonsDeLaSection('Meublé')).toEqual(['Indifférent', 'Oui', 'Non']);
    expect(screen.getByRole('button', { name: 'Indifférent' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Non » demande un logement vide (furnished=false)', () => {
    const { onFilterChange } = monte();
    deplier();
    fireEvent.click(screen.getByRole('button', { name: 'Non' }));
    expect(onFilterChange).toHaveBeenCalledWith({ furnished: false, page: 1 });
  });

  it('« Indifférent » retire le filtre', () => {
    const { onFilterChange } = monte({ furnished: false });
    deplier();
    expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Indifférent' }));
    expect(onFilterChange).toHaveBeenCalledWith({ furnished: undefined, page: 1 });
  });

  it('un clic sur « Indifférent » déjà pressé n’envoie rien', () => {
    const { onFilterChange } = monte();
    deplier();
    fireEvent.click(screen.getByRole('button', { name: 'Indifférent' }));
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('la bascule « Meublé uniquement » n’existe plus', () => {
    monte();
    deplier();
    expect(screen.queryByRole('button', { name: /Meublé uniquement/ })).not.toBeInTheDocument();
  });
});
```

**Étape 9.2 — rouge**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__/FilterSidebar.lot-e.test.tsx)
```

Attendu : rouges — `['Vente', 'Location']` reçu, `['1', '2', '3', '4', '5+']` reçu, `['RDC', '1er', …]`
reçu, « Unable to find an accessible element with the role "heading" and name "Meublé" ».

**Étape 9.3 — implémentation (Edit, `FilterSidebar.tsx`)**

Bloc A — remplacer

```ts
const CONTRACT_TYPE_VALUES = ['sale', 'rent'] as const;
```

par

```ts
/**
 * TCK-633 (lot E) — « Louer » AVANT « Acheter », et dans les mots de la barre de navigation
 * (`search.filters.transaction.*`), plus « Vente » / « Location » : le marché dakarois cherche
 * d'abord à louer, et deux vocabulaires pour le même choix sur le même écran se lisaient comme
 * deux choix.
 */
const CONTRACT_TYPE_VALUES = ['rent', 'sale'] as const;
```

Bloc B — remplacer

```ts
const BEDROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5+', value: 5 },
];

const BATHROOM_OPTIONS = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3+', value: 3 },
];

const FLOOR_KEYS = ['ground', 'first', 'second', 'third', 'fourthPlus'] as const;
```

par

```ts
// TCK-633 (lot E) — des MINIMUMS côté API (`bedrooms >= n`) : chaque puce le dit. « 5+ » seule le
// disait, et c'était la seule à être vraie — « 3 » trouvait les biens à 3 chambres, pas à 4.
const BEDROOM_OPTIONS = [
  { label: '1+', value: 1 },
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
  { label: '4+', value: 4 },
  { label: '5+', value: 5 },
];

const BATHROOM_OPTIONS = [
  { label: '1+', value: 1 },
  { label: '2+', value: 2 },
  { label: '3+', value: 3 },
];

/** Étage minimum : « RDC et + » (0) … « 4e et + » (4) — libellés `search.filters.floors.*`. */
const FLOOR_KEYS = ['ground', 'first', 'second', 'third', 'fourthPlus'] as const;

/**
 * TCK-633 (lot E) — « Meublé » en trois états. La bascule « Meublé uniquement » ne savait pas
 * demander un logement VIDE, que l'API filtre pourtant (`furnished=false`).
 */
const MEUBLE_VALUES = ['any', 'yes', 'no'] as const;
type ChoixMeuble = (typeof MEUBLE_VALUES)[number];

function meubleVersChoix(v: boolean | undefined): ChoixMeuble {
  if (v === true) return 'yes';
  if (v === false) return 'no';
  return 'any';
}

function choixVersMeuble(c: ChoixMeuble | undefined): boolean | undefined {
  if (c === 'yes') return true;
  if (c === 'no') return false;
  return undefined;
}
```

Bloc C — supprimer la ligne

```ts
  const tContract = useTranslations('property.contractTypes');
```

Bloc D — remplacer

```ts
  const contractTypes = CONTRACT_TYPE_VALUES.map((v) => ({ label: tContract(v), value: v }));
```

par

```ts
  const contractTypes = CONTRACT_TYPE_VALUES.map((v) => ({ label: t(`transaction.${v}`), value: v }));
  const meubleOptions = MEUBLE_VALUES.map((v) => ({ label: t(`furnished.${v}`), value: v }));
```

Bloc E — supprimer la bascule « Meublé uniquement » : le bloc qui commence par

```tsx
            <button
              type="button"
              aria-pressed={filters.furnished === true}
```

et finit par

```tsx
              <span className="text-sm font-semibold">{t('furnishedOnly')}</span>
              {enAttente(filters.furnished === true, confirmes.furnished === true) ? (
                <Loader2 data-attente="bascule" aria-hidden className="ml-auto size-4 shrink-0 animate-spin" />
              ) : null}
            </button>
```

(l. 728-754 au relevé) est remplacé par rien — la bascule « En vedette » qui suit reste.

Bloc F — remplacer

```tsx
        {/* 10. Étage */}
```

par

```tsx
        {/* 9 bis. Meublé — TCK-633 : indifférent, oui, non */}
        <Section title={t('furnished.title')}>
          <ChipGroup
            options={meubleOptions}
            value={meubleVersChoix(filters.furnished)}
            valeurConfirmee={meubleVersChoix(confirmes.furnished)}
            onChange={(v) => {
              const suivant = choixVersMeuble(v);
              if (suivant !== filters.furnished) set({ furnished: suivant });
            }}
          />
        </Section>

        {/* 10. Étage */}
```

**Étape 9.4 — les tests existants suivent le vocabulaire (Edit)**

- `FilterSidebar.test.tsx` : `screen.getByRole('button', { name: 'Vente' })` →
  `screen.getByRole('button', { name: 'Acheter' })` (le fichier est réécrit en Tâche 11 ; ce
  remplacement le garde vert d'ici là).
- `FilterSidebar.retour.test.tsx` : `fireEvent.click(puceDuTiroir('Vente'));` →
  `fireEvent.click(puceDuTiroir('Acheter'));`
- `attente-des-puces.test.tsx` : remplacer

```ts
    const vente = puce('Vente');
```

par

```ts
    const vente = puce('Acheter');
```

  et remplacer

```ts
  it('une bascule attend comme une puce', () => {
    panneau({ furnished: true }, {});
    expect(attend(screen.getByRole('button', { name: /Meublé uniquement/ }))).toBe(true);
  });
```

  par

```ts
  it('le choix « Meublé » attend comme une puce (TCK-633 : trois états)', () => {
    panneau({ furnished: true }, {});
    expect(attend(screen.getByRole('button', { name: 'Oui' }))).toBe(true);
    expect(attend(screen.getByRole('button', { name: 'Indifférent' }))).toBe(true);
    expect(attend(screen.getByRole('button', { name: 'Non' }))).toBe(false);
  });
```

**Étape 9.5 — vert**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__)
```

Attendu : tout vert.

**Étape 9.6 — ablation** : sauvegarder `FilterSidebar.tsx` (+ `md5`), remettre
`['sale', 'rent']` ; relancer `FilterSidebar.lot-e.test.tsx` → **1 rouge**
(`['Acheter', 'Louer']`). Restaurer par `cp`, `md5` identique. Seconde ablation, même procédure :
remplacer `if (v === false) return 'no';` par rien → rouges « Non … aria-pressed » et « Indifférent
retire le filtre ». Restaurer, `md5`.

**Étape 9.7 — signaler à la session** : `FilterSidebar.tsx`, `FilterSidebar.lot-e.test.tsx` et les
trois tests ajustés — `feat(web): panneau — Louer d'abord, minimums, meublé en trois états (TCK-633)`.

---

## Tâche 10 — listes du référentiel : hooks et adaptateur

**Files:**
- Create: `takussan-web/src/lib/queries/referentiel-public.ts`
- Create: `takussan-web/src/lib/queries/__tests__/referentiel-public.test.tsx`
- Create: `takussan-web/src/components/search/ChoixDuReferentiel.tsx`
- Create: `takussan-web/src/components/search/__tests__/ChoixDuReferentiel.test.tsx`

**Étape 10.1 — tests des hooks**

```tsx
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import {
  useEquipementsApprouves,
  useQuartiersDuReferentiel,
  useVillesDuReferentiel,
} from '../referentiel-public';

/**
 * TCK-633 (lot E) — les listes que le panneau de filtres propose : villes et quartiers du
 * référentiel (ADR-0062, lot D), équipements approuvés du catalogue. Ce test garde le CHEMIN (le
 * préfixe `/api` que `useApiQuery` n'ajoute pas — un oubli rend `net::ERR_FAILED` par CORS, pas
 * un 404) et la requête spatie : sparse fieldsets, `filter[]`, tri.
 */

const urls: string[] = [];

function repondre(data: unknown[]) {
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(decodeURIComponent(String(input)));
      return { ok: true, status: 200, json: async () => ({ data }) };
    }),
  );
}

function enveloppe() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Enveloppe({ children }: { children: React.ReactNode }) {
    return withIntl(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TCK-633 — hooks du référentiel public', () => {
  it('les villes viennent de /api/public/geo/cities, sans région', async () => {
    repondre([{ id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7, longitude: -17.45 }]);
    const { result } = renderHook(() => useVillesDuReferentiel(), { wrapper: enveloppe() });

    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Dakar'));
    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/\/api\/public\/geo\/cities$/);
  });

  it('les quartiers attendent une ville, puis la passent en `city`', async () => {
    repondre([{ id: 10, city_id: 7, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' }]);
    const sansVille = renderHook(() => useQuartiersDuReferentiel(null), { wrapper: enveloppe() });
    await new Promise((r) => setTimeout(r, 20));
    expect(sansVille.result.current.fetchStatus).toBe('idle');
    expect(urls).toHaveLength(0);

    const { result } = renderHook(() => useQuartiersDuReferentiel(7), { wrapper: enveloppe() });
    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Almadies'));
    expect(urls[0]).toMatch(/\/api\/public\/geo\/neighborhoods\?city=7$/);
  });

  it('les équipements sont ceux du catalogue APPROUVÉ, en sparse fieldsets', async () => {
    repondre([{ id: 3, name: 'Piscine', slug: 'piscine' }]);
    const { result } = renderHook(() => useEquipementsApprouves(), { wrapper: enveloppe() });

    await waitFor(() => expect(result.current.data?.data[0]?.name).toBe('Piscine'));
    expect(urls[0]).toContain('/api/tags?');
    expect(urls[0]).toContain('fields[tags]=id,name,slug');
    expect(urls[0]).toContain('filter[type]=amenity');
    expect(urls[0]).toContain('filter[status]=approved');
    expect(urls[0]).toContain('sort=name');
    expect(urls[0]).toContain('per_page=100');
  });
});
```

**Étape 10.2 — rouge** :
`(cd takussan-web && npx vitest run src/lib/queries/__tests__/referentiel-public.test.tsx)` →
attendu : `Failed to resolve import "../referentiel-public"`.

**Étape 10.3 — les hooks** (`src/lib/queries/referentiel-public.ts`)

```ts
'use client';

import { useApiQuery } from '@/hooks/useApiQuery';

/**
 * TCK-633 (lot E) — les listes publiques que le panneau de filtres propose.
 *
 * - villes et quartiers : le référentiel géographique (ADR-0062, routes du lot D) ; la recherche
 *   filtre toujours par le NOM canonique (`city`, `location`), jamais par l'identifiant ;
 * - équipements : le catalogue approuvé (`tags` de type `amenity`), indexé par nom.
 *
 * ⚠ `useApiQuery` n'ajoute PAS `/api` : chaque chemin l'écrit (`takussan-web/CLAUDE.md`).
 * Les listes bougent peu : une heure de fraîcheur, et un seul appel pour le rail ET le tiroir.
 */

export interface VilleDuReferentiel {
  readonly id: number;
  readonly region_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface QuartierDuReferentiel {
  readonly id: number;
  readonly city_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly status: string;
}

export interface EquipementDuCatalogue {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

export interface ListeDuReferentiel<T> {
  readonly data: readonly T[];
}

/** Sparse fieldset des équipements : le panneau n'affiche que le nom. */
export const CHAMPS_DES_EQUIPEMENTS = ['id', 'name', 'slug'] as const;

const UNE_HEURE_MS = 60 * 60 * 1000;

export const referentielPublicQueryKeys = {
  all: ['referentiel-public'] as const,
  villes: () => [...referentielPublicQueryKeys.all, 'villes'] as const,
  quartiers: (villeId: number | null) => [...referentielPublicQueryKeys.all, 'quartiers', villeId] as const,
  equipements: () => [...referentielPublicQueryKeys.all, 'equipements'] as const,
};

export function useVillesDuReferentiel() {
  return useApiQuery<ListeDuReferentiel<VilleDuReferentiel>>(
    referentielPublicQueryKeys.villes(),
    '/api/public/geo/cities',
    { staleTime: UNE_HEURE_MS },
  );
}

/** Les quartiers APPROUVÉS d'une ville ; rien n'est demandé tant qu'aucune ville n'est choisie. */
export function useQuartiersDuReferentiel(villeId: number | null) {
  return useApiQuery<ListeDuReferentiel<QuartierDuReferentiel>>(
    referentielPublicQueryKeys.quartiers(villeId),
    '/api/public/geo/neighborhoods',
    {
      params: { extra: { city: villeId ?? undefined } },
      enabled: villeId !== null,
      staleTime: UNE_HEURE_MS,
    },
  );
}

export function useEquipementsApprouves() {
  return useApiQuery<ListeDuReferentiel<EquipementDuCatalogue>>(
    referentielPublicQueryKeys.equipements(),
    '/api/tags',
    {
      params: {
        fields: { tags: CHAMPS_DES_EQUIPEMENTS },
        filter: { type: 'amenity', status: 'approved' },
        sort: 'name',
        per_page: 100,
      },
      staleTime: UNE_HEURE_MS,
    },
  );
}
```

**Étape 10.4 — vert** : relancer 10.2 → 3 tests verts.

**Étape 10.5 — tests de l'adaptateur** (`components/search/__tests__/ChoixDuReferentiel.test.tsx`)

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';

/**
 * TCK-633 (lot E) — l'adaptateur entre le panneau de filtres et la primitive combobox du lot D.
 * Les hooks sont remplacés (leurs propres tests gardent le réseau) : ce fichier garde ce que le
 * panneau reçoit — un NOM canonique, ou `undefined` pour retirer — et s'écrit par rôles ARIA, pour
 * survivre à une primitive réécrite.
 */

vi.mock('@/lib/queries/referentiel-public', () => ({
  useVillesDuReferentiel: () => ({
    data: {
      data: [
        { id: 1, region_id: 1, name: 'Dakar', slug: 'dakar', latitude: 14.7, longitude: -17.45 },
        { id: 2, region_id: 2, name: 'Thiès', slug: 'thies', latitude: 14.79, longitude: -16.93 },
      ],
    },
  }),
  useQuartiersDuReferentiel: (villeId: number | null) => ({
    data: villeId === 1
      ? {
          data: [
            { id: 10, city_id: 1, name: 'Almadies', slug: 'almadies', latitude: null, longitude: null, status: 'approved' },
            { id: 11, city_id: 1, name: 'Liberté 4', slug: 'liberte-4', latitude: null, longitude: null, status: 'approved' },
          ],
        }
      : undefined,
  }),
  useEquipementsApprouves: () => ({
    data: { data: [{ id: 3, name: 'Piscine', slug: 'piscine' }, { id: 4, name: 'Parking', slug: 'parking' }] },
  }),
}));

const { ChoixDeVille, ChoixDeQuartier, ChoixDEquipements } = await import('../ChoixDuReferentiel');

describe('TCK-633 — ChoixDeVille', () => {
  it('rend le NOM canonique choisi dans la liste', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeVille valeur={undefined} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Ville' }), 'Thi');
    await user.click(await screen.findByRole('option', { name: 'Thiès' }));

    expect(onChange).toHaveBeenLastCalledWith('Thiès');
  });

  it('une ville de l’URL hors référentiel reste affichée, et se retire', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeVille valeur="Saly" onChange={onChange} />));

    expect(screen.getByRole('combobox', { name: 'Ville' })).toHaveValue('Saly');
    await user.click(screen.getByRole('button', { name: 'Retirer la ville' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('sans ville, aucun bouton de retrait', () => {
    render(withIntl(<ChoixDeVille valeur={undefined} onChange={vi.fn()} />));
    expect(screen.queryByRole('button', { name: 'Retirer la ville' })).not.toBeInTheDocument();
  });
});

describe('TCK-633 — ChoixDeQuartier', () => {
  it('est inactif tant qu’aucune ville n’est choisie', () => {
    render(withIntl(<ChoixDeQuartier ville={undefined} valeur={undefined} onChange={vi.fn()} />));
    expect(screen.getByRole('combobox', { name: 'Quartier' })).toBeDisabled();
  });

  it('propose les quartiers de la ville, retrouvée par son nom quelle qu’en soit la casse', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDeQuartier ville="dakar" valeur={undefined} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Quartier' }), 'Alma');
    await user.click(await screen.findByRole('option', { name: 'Almadies' }));

    expect(onChange).toHaveBeenLastCalledWith('Almadies');
  });
});

describe('TCK-633 — ChoixDEquipements', () => {
  it('ajoute un équipement du catalogue à ceux déjà choisis', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(withIntl(<ChoixDEquipements valeurs={['Parking']} onChange={onChange} />));

    await user.type(screen.getByRole('combobox', { name: 'Équipements' }), 'Pis');
    await user.click(await screen.findByRole('option', { name: 'Piscine' }));

    expect(onChange).toHaveBeenLastCalledWith(['Parking', 'Piscine']);
  });
});
```

**Étape 10.6 — rouge** :
`(cd takussan-web && npx vitest run src/components/search/__tests__/ChoixDuReferentiel.test.tsx)` →
attendu : `Failed to resolve import "../ChoixDuReferentiel"`.

**Étape 10.7 — l'adaptateur** (`src/components/search/ChoixDuReferentiel.tsx`)

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox';
import {
  useEquipementsApprouves,
  useQuartiersDuReferentiel,
  useVillesDuReferentiel,
} from '@/lib/queries/referentiel-public';

/**
 * TCK-633 (lot E) — ville, quartier et équipements se CHOISISSENT dans des listes.
 *
 * C'étaient trois champs de texte libre : une faute de frappe (« Dakr », « Liberte 4 ») rendait
 * 0 résultat sans un mot, la recherche comparant par égalité (ADR-0062, contexte). Les listes
 * viennent du référentiel (villes, quartiers approuvés) et du catalogue (équipements approuvés) ;
 * le panneau reçoit toujours un NOM canonique, que la recherche compare tel quel.
 *
 * ⚠ Ce fichier est le SEUL importateur de `@/components/ui/combobox` (primitive du lot D) côté
 * recherche : si la primitive change d'API, c'est ici, et nulle part ailleurs, qu'on l'adapte. Ses
 * tests s'écrivent par rôles ARIA pour la même raison.
 */

export interface ChoixDeVilleProps {
  readonly valeur: string | undefined;
  readonly onChange: (valeur: string | undefined) => void;
}

export interface ChoixDeQuartierProps extends ChoixDeVilleProps {
  /** Le nom de la ville choisie — le quartier ne se choisit qu'à l'intérieur d'une ville. */
  readonly ville: string | undefined;
}

export interface ChoixDEquipementsProps {
  readonly valeurs: readonly string[];
  readonly onChange: (valeurs: string[]) => void;
}

/** Repli de casse pour retrouver une ville par son nom — l'intention de `CaseInsensitive::fold`. */
function replie(nom: string): string {
  return nom.toLocaleLowerCase('fr');
}

/**
 * Les noms proposés, la valeur courante en tête quand le référentiel ne la connaît pas (une URL
 * ancienne, un lien partagé) : elle reste VISIBLE, donc retirable, au lieu de disparaître du champ
 * pendant que la liste la filtre encore.
 */
export function optionsAvecLaValeur(noms: readonly string[], valeur: string | undefined): string[] {
  if (!valeur || noms.includes(valeur)) return [...noms];
  return [valeur, ...noms];
}

function BoutonDeRetrait({ libelle, onClick }: { readonly libelle: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={libelle}
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}

interface ChampDeListeProps {
  readonly libelle: string;
  readonly placeholder: string;
  readonly vide: string;
  readonly libelleRetrait: string;
  readonly options: readonly string[];
  readonly valeur: string | undefined;
  readonly onChange: (valeur: string | undefined) => void;
  readonly disabled?: boolean;
}

function ChampDeListe({
  libelle,
  placeholder,
  vide,
  libelleRetrait,
  options,
  valeur,
  onChange,
  disabled = false,
}: ChampDeListeProps) {
  return (
    <div className="flex items-center gap-1">
      <div className="min-w-0 flex-1">
        <Combobox
          items={[...options]}
          value={valeur ?? null}
          onValueChange={(choisi: string | null) => onChange(choisi ?? undefined)}
          disabled={disabled}
        >
          <ComboboxInput
            aria-label={libelle}
            placeholder={placeholder}
            disabled={disabled}
            showClear={false}
            className="rounded-xl"
          />
          <ComboboxContent>
            <ComboboxEmpty>{vide}</ComboboxEmpty>
            <ComboboxList>
              {(nom: string) => (
                <ComboboxItem key={nom} value={nom}>
                  {nom}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {valeur ? <BoutonDeRetrait libelle={libelleRetrait} onClick={() => onChange(undefined)} /> : null}
    </div>
  );
}

export function ChoixDeVille({ valeur, onChange }: ChoixDeVilleProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  const noms = (villes.data?.data ?? []).map((ville) => ville.name);

  return (
    <ChampDeListe
      libelle={t('place.city')}
      placeholder={t('place.cityPlaceholder')}
      vide={t('place.noCity')}
      libelleRetrait={t('place.clearCity')}
      options={optionsAvecLaValeur(noms, valeur)}
      valeur={valeur}
      onChange={onChange}
    />
  );
}

export function ChoixDeQuartier({ ville, valeur, onChange }: ChoixDeQuartierProps) {
  const t = useTranslations('search.filters');
  const villes = useVillesDuReferentiel();
  const villeId = ville
    ? ((villes.data?.data ?? []).find((v) => replie(v.name) === replie(ville))?.id ?? null)
    : null;
  const quartiers = useQuartiersDuReferentiel(villeId);
  const noms = (quartiers.data?.data ?? []).map((quartier) => quartier.name);
  const sansVille = !ville;

  return (
    <ChampDeListe
      libelle={t('place.quarter')}
      placeholder={sansVille ? t('place.quarterNeedsCity') : t('place.quarterPlaceholder')}
      vide={t('place.noQuarter')}
      libelleRetrait={t('place.clearQuarter')}
      options={optionsAvecLaValeur(noms, valeur)}
      valeur={valeur}
      onChange={onChange}
      disabled={sansVille}
    />
  );
}

/** Équipements : OU côté serveur (`tags=Piscine,Parking` → l'un ou l'autre), dit par le rappel. */
export function ChoixDEquipements({ valeurs, onChange }: ChoixDEquipementsProps) {
  const t = useTranslations('search.filters');
  const ancre = useComboboxAnchor();
  const equipements = useEquipementsApprouves();
  const noms = (equipements.data?.data ?? []).map((equipement) => equipement.name);
  const options = [...valeurs.filter((v) => !noms.includes(v)), ...noms];

  return (
    <Combobox
      multiple
      items={options}
      value={[...valeurs]}
      onValueChange={(choisis: string[]) => onChange([...choisis])}
    >
      <ComboboxChips ref={ancre} className="rounded-xl">
        <ComboboxValue>
          {(choisis: string[]) => (
            <>
              {choisis.map((nom) => (
                <ComboboxChip key={nom}>{nom}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                aria-label={t('sections.amenities')}
                placeholder={choisis.length === 0 ? t('amenityPicker.placeholder') : undefined}
              />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={ancre}>
        <ComboboxEmpty>{t('amenityPicker.empty')}</ComboboxEmpty>
        <ComboboxList>
          {(nom: string) => (
            <ComboboxItem key={nom} value={nom}>
              {nom}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

**Étape 10.8 — vert, types et lint**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__/ChoixDuReferentiel.test.tsx src/lib/queries/__tests__/referentiel-public.test.tsx && npx tsc --noEmit && npx eslint src/components/search/ChoixDuReferentiel.tsx src/lib/queries/referentiel-public.ts)
```

Attendu : 6 + 3 tests verts, `tsc` sans erreur, ESLint 0 erreur. Si `tsc` refuse une prop
(`showClear`, signature d'`onValueChange`) : la primitive de D diffère de l'API relevée en Tâche 0 —
adapter **ce fichier seulement** (ses tests ne changent pas), écrire l'écart en `collisions`.

**Étape 10.9 — ablation** : sauvegarder l'adaptateur (+ `md5`) ; dans `ChoixDeQuartier`, remplacer
`replie(v.name) === replie(ville)` par `v.name === ville` → **1 rouge** (« quelle qu'en soit la
casse » : `findByRole('option', { name: 'Almadies' })` expire). Restaurer par `cp`, `md5`. Seconde
ablation : dans `optionsAvecLaValeur`, retourner `[...noms]` toujours → **1 rouge** (`toHaveValue('Saly')`).
Restaurer, `md5`.

**Étape 10.10 — signaler à la session** : les quatre fichiers —
`feat(web): listes du référentiel et des équipements pour la recherche (TCK-633)`.

---

## Tâche 11 — brancher les listes dans le panneau, retirer l'anti-rebond

**Files:**
- Create: `takussan-web/src/components/search/__tests__/doublure-choix-du-referentiel.tsx`
- Modify: `takussan-web/src/components/search/FilterSidebar.tsx`
- Rewrite: `takussan-web/src/components/search/__tests__/FilterSidebar.test.tsx`
- Modify: `FilterSidebar.lot-e.test.tsx`, `FilterSidebar.retour.test.tsx`, `FilterSidebar.tiroir.test.tsx`,
  `attente-des-puces.test.tsx`, et les six `PropertiesDiscoveryPage.*.test.tsx` (une ligne)

**Pourquoi l'anti-rebond part.** Il n'existait que pour les trois champs libres (ville, quartier,
équipements : `differe.call()` dans `surSaisieLibre`) ; les bornes numériques ne l'arment jamais
(`RangeInputs` commite au `blur` / `Enter`, `commitImmediat`). Les listes commitent un CHOIX, geste
discret. Le garder laisserait `debounceMs`, `surSaisieLibre`, `surFinSaisieLibre` et `surToucheLibre`
sans appelant (ESLint `no-unused-vars`).

**Étape 11.1 — la doublure** (`__tests__/doublure-choix-du-referentiel.tsx`, non exécutée : pas de
suffixe `.test`)

```tsx
/**
 * Doublure de `ChoixDuReferentiel` pour les tests qui montent le panneau de filtres SANS
 * `QueryClientProvider` : les vraies listes interrogent l'API par React Query. La doublure garde le
 * contrat de props, et c'est lui seul que ces tests éprouvent ; l'adaptateur a ses propres tests
 * (`ChoixDuReferentiel.test.tsx`).
 *
 * Usage : `vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));`
 */
import type {
  ChoixDEquipementsProps,
  ChoixDeQuartierProps,
  ChoixDeVilleProps,
} from '../ChoixDuReferentiel';

export function ChoixDeVille({ valeur, onChange }: ChoixDeVilleProps) {
  return (
    <div data-testid="choix-ville" data-valeur={valeur ?? ''}>
      <button type="button" onClick={() => onChange('Dakar')}>choisir-ville-Dakar</button>
      <button type="button" onClick={() => onChange(undefined)}>retirer-ville</button>
    </div>
  );
}

export function ChoixDeQuartier({ ville, valeur, onChange }: ChoixDeQuartierProps) {
  return (
    <div data-testid="choix-quartier" data-ville={ville ?? ''} data-valeur={valeur ?? ''}>
      <button type="button" onClick={() => onChange('Almadies')}>choisir-quartier-Almadies</button>
    </div>
  );
}

export function ChoixDEquipements({ valeurs, onChange }: ChoixDEquipementsProps) {
  return (
    <div data-testid="choix-equipements" data-valeurs={valeurs.join(',')}>
      <button type="button" onClick={() => onChange([...valeurs, 'Piscine'])}>ajouter-Piscine</button>
    </div>
  );
}
```

**Étape 11.2 — tests d'abord**

a) `FilterSidebar.lot-e.test.tsx` — Edit : après la ligne
`import type { SearchFilters } from '@/types/search';`, ajouter

```tsx

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));
```

et ajouter en fin de fichier :

```tsx

describe('TCK-633 — ville, quartier et équipements se choisissent dans des listes', () => {
  it('le panneau ne porte plus de champ de texte libre pour la ville, le quartier ni les équipements', () => {
    monte();
    deplier();
    expect(screen.queryByPlaceholderText('Ville (ex : Dakar, Mbour…)')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Quartier')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/piscine, parking/)).not.toBeInTheDocument();
    expect(screen.getByTestId('choix-ville')).toBeInTheDocument();
    expect(screen.getByTestId('choix-quartier')).toBeInTheDocument();
    expect(screen.getByTestId('choix-equipements')).toBeInTheDocument();
  });

  it('choisir une ville la pose et retire un quartier qui appartenait à une autre', () => {
    const { onFilterChange } = monte({ city: 'Thiès', location: 'Almadies' });
    fireEvent.click(screen.getByRole('button', { name: 'choisir-ville-Dakar' }));
    expect(onFilterChange).toHaveBeenCalledWith({ city: 'Dakar', location: undefined, page: 1 });
  });

  it('le quartier reçoit la ville choisie, et se pose par son nom', () => {
    const { onFilterChange } = monte({ city: 'Dakar' });
    expect(screen.getByTestId('choix-quartier')).toHaveAttribute('data-ville', 'Dakar');
    fireEvent.click(screen.getByRole('button', { name: 'choisir-quartier-Almadies' }));
    expect(onFilterChange).toHaveBeenCalledWith({ location: 'Almadies', page: 1 });
  });

  it('les équipements s’ajoutent à la liste à virgules de l’URL, et se retirent tous d’un coup', () => {
    const { onFilterChange } = monte({ tags: 'Parking' });
    deplier();
    expect(screen.getByTestId('choix-equipements')).toHaveAttribute('data-valeurs', 'Parking');
    fireEvent.click(screen.getByRole('button', { name: 'ajouter-Piscine' }));
    expect(onFilterChange).toHaveBeenCalledWith({ tags: 'Parking,Piscine', page: 1 });
  });

  it('le rappel dit que les équipements se combinent en OU', () => {
    monte();
    deplier();
    expect(screen.getByText('Biens offrant au moins un des équipements choisis')).toBeInTheDocument();
  });
});
```

b) `FilterSidebar.test.tsx` — **réécrire le fichier entier** (Write ; test du territoire) :

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

/**
 * TCK-335, étape 3 — les brouillons de saisie du panneau de filtres publics.
 *
 * ## Pourquoi ce test porte sur le COMPOSANT et non sur `PropertiesDiscoveryPage`
 *
 * Au niveau de la page, `useRouter` est moqué, donc `useSearchParams` ne change jamais, donc
 * l'effet de `useSearch` ne se rejoue jamais. Ici, la seule frontière observée est
 * `onFilterChange`, celle que les brouillons gouvernent.
 *
 * ## TCK-633 (lot E) — ce qui a disparu, et pourquoi
 *
 * La ville, le quartier et les équipements ne sont plus des champs LIBRES : ils se choisissent
 * dans des listes (référentiel géographique, catalogue). L'anti-rebond qu'exigeaient leurs frappes
 * (AC7a, AC7b, AC7e, AC7g de TCK-335) n'a plus d'objet et a été retiré avec eux. Restent les
 * bornes numériques, qui gardent leur brouillon et ne commitent qu'au `blur` / `Enter` (AC7d), et
 * la règle que ce fichier existe pour tenir : **un geste discret ne perd jamais une saisie en
 * cours** (AC7c, AC7f, « Autour de moi ») — désormais éprouvée sur la borne de prix.
 *
 * {@link frappe} enchaîne ses `fireEvent.change` dans une seule tâche : aucun minuteur ne peut
 * échoir pendant la frappe, et `expect(onFilterChange).not.toHaveBeenCalled()` est vrai par
 * construction, pas par marge (TCK-478).
 */

const PLACEHOLDER_PRIX_MIN = 'Min';

function monte(filters: SearchFilters = {}) {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={onReset}
        activeCount={0}
        open={false}
        onClose={() => {}}
      />,
    ),
  );
  return { onFilterChange, onReset };
}

function frappe(input: HTMLElement, texte: string) {
  for (let i = 1; i <= texte.length; i += 1) {
    fireEvent.change(input, { target: { value: texte.slice(0, i) } });
  }
}

describe('<FilterSidebar> — brouillons des bornes numériques (TCK-335)', () => {
  it('AC7c — cliquer une puce pendant une saisie de prix CONSERVE LES DEUX', () => {
    const { onFilterChange } = monte();
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;

    frappe(prixMin, '150000');
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Acheter' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      price_min: 150000,
      contract_type: 'sale',
      rent_period: undefined,
      page: 1,
    });
    // Le montant n'a pas été effacé de l'écran par le clic.
    expect(prixMin.value).toBe('150000');
  });

  it("AC7d — une borne numérique ne commite QU'au blur, jamais sur un timer", async () => {
    const { onFilterChange } = monte();
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;

    frappe(prixMin, '150000');
    expect(prixMin.value).toBe('150000');

    // Un anti-rebond laisserait passer `price_min=15` — qui rend LE CATALOGUE ENTIER.
    await new Promise((r) => setTimeout(r, 60));
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.blur(prixMin);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ price_min: 150000, page: 1 }, { continu: true });
  });

  it('AC7f — le brouillon se resynchronise quand `filters` change vraiment (retour arrière)', () => {
    const onFilterChange = vi.fn();
    const communs = { onFilterChange, onReset: () => {}, open: false, onClose: () => {} };
    const { rerender } = render(
      withIntl(<FilterSidebar filters={{ price_min: 100000 }} activeCount={1} {...communs} />),
    );
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;
    expect(prixMin.value).toBe('100000');

    fireEvent.change(prixMin, { target: { value: '2' } });
    expect(prixMin.value).toBe('2');

    rerender(withIntl(<FilterSidebar filters={{}} activeCount={0} {...communs} />));
    expect(prixMin.value).toBe('');
  });
});

/**
 * TCK-346 — le rayon est CÂBLÉ au panneau, pas seulement écrit à côté : son `onChange` arrive sur
 * `onFilterChange`, avec le brouillon de saisie en cours FUSIONNÉ.
 */
describe('<FilterSidebar> — la commande « Autour de moi » (TCK-346)', () => {
  function geolocalisationQuiRepond() {
    return {
      getCurrentPosition: vi.fn((ok: PositionCallback) =>
        ok({ coords: { latitude: 14.6928, longitude: -17.4467 }, timestamp: 0 } as unknown as GeolocationPosition)),
    };
  }

  function monteAvecGeo(filters: SearchFilters = {}) {
    const onFilterChange = vi.fn();
    render(
      withIntl(
        <FilterSidebar
          filters={filters}
          onFilterChange={onFilterChange}
          onReset={vi.fn()}
          activeCount={0}
          open={false}
          onClose={() => {}}
          geolocalisation={geolocalisationQuiRepond()}
        />,
      ),
    );
    return { onFilterChange };
  }

  it('transmet le point et le rayon à `onFilterChange`', () => {
    const { onFilterChange } = monteAvecGeo();

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 14.6928, lng: -17.4467, radius_km: 5 }),
    );
  });

  it('n’EFFACE PAS le prix en cours de frappe', () => {
    const { onFilterChange } = monteAvecGeo();
    frappe(screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN), '150000');

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ price_min: 150000, lat: 14.6928 }),
    );
  });

  it('affiche le choix du rayon dès qu’un point existe', () => {
    monteAvecGeo({ lat: 14.6928, lng: -17.4467, radius_km: 10 });
    expect(screen.getByRole('button', { name: '10 km' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2 km' })).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * Le panneau ne montre PAS `q` : le terme se lit et se modifie dans le champ de recherche de la
 * barre de navigation, qui le relit dans l'URL. Une section « Mots-clés » ici en faisait une
 * seconde copie.
 */
describe('<FilterSidebar> — aucune section « Mots-clés »', () => {
  it.each([
    ['sans `q`', {}],
    ['avec `q`', { q: 'villa piscine' }],
  ])('%s : ni section, ni terme, ni champ plein-texte', (_cas, filtres) => {
    monte(filtres);
    expect(screen.queryByText('Mots-clés')).not.toBeInTheDocument();
    expect(screen.queryByText('villa piscine')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Effacer la recherche/ })).not.toBeInTheDocument();
  });
});
```

c) `FilterSidebar.retour.test.tsx` (Edit) :
- après `import { withIntl } from '@/test/intl';`, ajouter la ligne
  `vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));`
- dans `Banc`, supprimer la ligne `        debounceMs={20}` ;
- remplacer le test `it('un brouillon encore en attente d’anti-rebond est gardé, sur l’entrée de la séance', …)`
  entier par :

```tsx
  it('une borne tapée et pas encore validée est gardée, sur l’entrée de la séance', async () => {
    window.history.pushState({}, '', '/properties?bedrooms=2');
    render(withIntl(<Banc />));
    ouvrir();
    // Tapée, ni `blur` ni `Enter` : le brouillon n'est pas commité au moment du retour.
    fireEvent.change(within(tiroir()).getByPlaceholderText('Min'), { target: { value: '150000' } });
    expect(new URLSearchParams(window.location.search).has('price_min')).toBe(false);

    await retour();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(new URLSearchParams(window.location.search).get('price_min')).toBe('150000'));
    // Commité sur l'entrée de la SÉANCE : l'entrée d'avant le tiroir est intacte, un retour y mène.
    await retour();
    await waitFor(() => expect(window.location.search).toBe('?bedrooms=2'));
  });
```

- dans le test AC4, remplacer **les deux** lignes
  `expect(within(tiroir()).getByPlaceholderText('Ville (ex : Dakar, Mbour…)')).toHaveValue('');`
  par `expect(within(tiroir()).getByTestId('choix-ville')).toHaveAttribute('data-valeur', '');`
  (deux Edit, la première ancrée sur la ligne qui précède `fireEvent.click(rappel);`).

d) `FilterSidebar.tiroir.test.tsx` (Edit) : ajouter la même ligne `vi.mock(…)` après l'import de
`withIntl`, supprimer `        debounceMs={20}`.

e) `attente-des-puces.test.tsx` (Edit) : ajouter la même ligne `vi.mock(…)` après
`import { withIntl } from '@/test/intl';`.

f) Les six tests de page (Edit, une ligne chacun) : dans
`PropertiesDiscoveryPage.{repli,etat-vide,error,grille,outils}.test.tsx`, après la ligne
`vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));` ; dans
`PropertiesDiscoveryPage.carte-mobile.test.tsx`, après
`vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="pied" /> }));` ;
et dans `PropertiesDiscoveryPage.carte-geo.test.tsx`, après sa ligne `Footer` ; ajouter :

```tsx
// TCK-633 — les listes du référentiel interrogent l'API par React Query ; la page est montée ici
// sans `QueryClientProvider`.
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
```

**Étape 11.3 — rouge**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__/FilterSidebar.lot-e.test.tsx src/components/search/__tests__/FilterSidebar.retour.test.tsx)
```

Attendu : rouges — `choix-ville` introuvable, placeholder « Ville (ex : … ) » encore présent.
(`FilterSidebar.test.tsx` réécrit peut déjà être vert : il ne cible plus que le prix.)

**Étape 11.4 — implémentation (Edit, `FilterSidebar.tsx`)**

Imports — remplacer

```ts
import { X, RotateCcw, Search, Star, Tag, Loader2 } from 'lucide-react';
```

par

```ts
import { X, RotateCcw, Search, Star, Loader2 } from 'lucide-react';
```

remplacer

```ts
import { useDebouncedCallback } from '@/hooks/useDebouncedValue';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { AutourDeMoi } from '@/components/search/AutourDeMoi';
```

par

```ts
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { AutourDeMoi } from '@/components/search/AutourDeMoi';
import { ChoixDeQuartier, ChoixDeVille, ChoixDEquipements } from '@/components/search/ChoixDuReferentiel';
```

Constante — remplacer

```ts
/** Délai d'anti-rebond des champs LIBRES, en millisecondes. */
const DEBOUNCE_CHAMPS_LIBRES_MS = 400;

/** `''` → `undefined` : un filtre vide n'est pas un filtre, il ne doit pas partir dans l'URL. */
function texteVersFiltre(v: string): string | undefined {
  return v === '' ? undefined : v;
}

function nombreVersFiltre
```

par

```ts
function nombreVersFiltre
```

Props — remplacer

```ts
  /**
   * Délai d'anti-rebond des champs libres. Injectable pour que les tests le réduisent à
   * quelques millisecondes sans figer les timers (patron `WizardReprenable`) — jamais pour
   * l'ajuster en production.
   */
  debounceMs?: number;
  /** Passé tel quel
```

par

```ts
  /** Passé tel quel
```

Docblock du composant — remplacer le bloc

```ts
/**
 * Panneau de filtres publics.
 *
 * ## L'anti-rebond est ICI, et les deux autres emplacements sont interdits (TCK-335, étape 3)
```

… jusqu'à

```ts
 *   contrôlé par une URL qui ne bouge pas, donc le caractère frappé disparaît.
 */
```

(l. 248-269) par

```ts
/**
 * Panneau de filtres publics.
 *
 * ## Les brouillons (TCK-335, étape 3)
 *
 * Chaque borne numérique (prix, surface) tient un **brouillon local**, resynchronisé sur `filters`
 * par `useStateSyncedWith` (TCK-316), et ne commite qu'au `blur` / `Enter` (cf. {@link RangeInputs}).
 * Avant, l'input était contrôlé par `filters`, qui vient de l'URL : `router.replace` étant une
 * transition, le caractère frappé disparaissait de l'écran le temps de l'aller-retour RSC.
 *
 * ## TCK-633 (lot E) — plus aucun champ libre
 *
 * La ville, le quartier et les équipements se CHOISISSENT dans des listes
 * (`ChoixDuReferentiel`) : un choix est un geste discret, il commite tout de suite. L'anti-rebond
 * qu'exigeaient leurs frappes est retiré avec eux.
 */
```

Signature — remplacer

```ts
  total = null,
  debounceMs = DEBOUNCE_CHAMPS_LIBRES_MS,
  geolocalisation,
```

par

```ts
  total = null,
  geolocalisation,
```

Brouillons — remplacer

```ts
  const [cityDraft, setCityDraft] = useStateSyncedWith(filters.city ?? '');
  const [locationDraft, setLocationDraft] = useStateSyncedWith(filters.location ?? '');
  const [tagsDraft, setTagsDraft] = useStateSyncedWith(filters.tags ?? '');
  const [priceMinDraft
```

par

```ts
  const [priceMinDraft
```

et remplacer

```ts
  const brouillonEnAttente: Partial<SearchFilters> = {};
  if (texteVersFiltre(cityDraft) !== filters.city) {
    brouillonEnAttente.city = texteVersFiltre(cityDraft);
  }
  if (texteVersFiltre(locationDraft) !== filters.location) {
    brouillonEnAttente.location = texteVersFiltre(locationDraft);
  }
  if (texteVersFiltre(tagsDraft) !== filters.tags) {
    brouillonEnAttente.tags = texteVersFiltre(tagsDraft);
  }
  if (nombreVersFiltre(priceMinDraft)
```

par

```ts
  const brouillonEnAttente: Partial<SearchFilters> = {};
  if (nombreVersFiltre(priceMinDraft)
```

Commits — remplacer le bloc qui va de

```ts
  // `useDebouncedCallback` relit `commitBrouillon` au DÉCLENCHEMENT, jamais à l'armement : un
```

jusqu'à la fin de `commitImmediat` incluse

```ts
  const commitImmediat = () => {
    differe.cancel();
    commitBrouillon();
  };
```

(l. 355-405) par

```ts
  /**
   * Commit d'un geste DISCRET (puce, bascule, date, choix dans une liste, retrait).
   *
   * ⚠️ Le brouillon en attente — une borne tapée, pas encore validée — est fusionné dans le patch.
   * Sans cela, cliquer une puce pendant la saisie d'un prix EFFACE le montant : `filters`
   * repartirait sans lui, et `useStateSyncedWith` ramènerait le champ à vide.
   */
  const set = (patch: Partial<SearchFilters>) => {
    commettre({ ...brouillonEnAttente, ...patch, page: 1 }, false);
  };

  /**
   * Commit SÉANCE TENANTE de tout ce qui est en attente : le `blur` et l'`Enter` des bornes
   * numériques (cf. {@link RangeInputs}), et le bouton « Voir les résultats » du tiroir mobile.
   */
  const commitImmediat = () => {
    commitBrouillon();
  };
```

`reinitialiser` — remplacer

```ts
  const reinitialiser = () => {
    differe.cancel();
    if (!open) {
```

par

```ts
  const reinitialiser = () => {
    if (!open) {
```

Tiroir — remplacer

```ts
  const surRetourDansLeTiroir = () => {
    differe.cancel();
    const brouillon = brouillonEnAttente;
```

par

```ts
  const surRetourDansLeTiroir = () => {
    const brouillon = brouillonEnAttente;
```

et, dans le docblock qui précède, remplacer `brouillon encore en attente d'anti-rebond est commité`
par `une borne tapée et pas encore validée est commitée`, puis
`(ou s'apprête à le faire : un brouillon dont l'anti-rebond court encore)` par
`(ou s'apprête à le faire : une borne tapée, pas encore validée)`.

Avant `const rendreCorps`, ajouter (ancre : la ligne `  const rendreCorps = (rappel?: React.ReactNode) => (`) :

```ts
  /** Les équipements choisis, depuis la liste à virgules de l'URL (`tags=Piscine,Parking`). */
  const equipementsChoisis = (filters.tags ?? '')
    .split(',')
    .map((nom) => nom.trim())
    .filter((nom) => nom !== '');

```

Section Lieu — remplacer

```tsx
        {/* 4. Location */}
        <Section title={t(`sections.location`)}>
          <div className="space-y-2">
            <Input
```

… jusqu'à la fin de cette section

```tsx
              className="rounded-xl"
            />
          </div>
        </Section>

        {/*
          4 bis. Autour de moi — TCK-346.
```

par

```tsx
        {/* 4. Lieu — TCK-633 : ville et quartier se CHOISISSENT dans le référentiel (ADR-0062) ;
            la recherche filtre par le NOM canonique. Changer de ville retire un quartier qui
            appartenait à l'autre. */}
        <Section title={t(`sections.location`)}>
          <div className="space-y-2">
            <ChoixDeVille
              valeur={filters.city}
              onChange={(city) => set({ city, location: city === filters.city ? filters.location : undefined })}
            />
            <ChoixDeQuartier
              ville={filters.city}
              valeur={filters.location}
              onChange={(location) => set({ location })}
            />
          </div>
        </Section>

        {/*
          4 bis. Autour de moi — TCK-346.
```

Section Équipements — remplacer

```tsx
        {/* 13. Tags */}
        <Section title={t(`sections.amenities`)}>
          <div className="relative">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={t('amenitiesPlaceholder')}
              value={tagsDraft}
              onChange={surSaisieLibre(setTagsDraft)}
              onBlur={surFinSaisieLibre}
              onKeyDown={surToucheLibre}
              className="rounded-xl pl-9"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t('amenitiesHint')}</p>
        </Section>
```

par

```tsx
        {/* 13. Équipements — TCK-633 : le catalogue approuvé, en multi-sélection. OU côté serveur. */}
        <Section title={t(`sections.amenities`)}>
          <ChoixDEquipements
            valeurs={equipementsChoisis}
            onChange={(noms) => set({ tags: noms.length > 0 ? noms.join(',') : undefined })}
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t('amenityPicker.hint')}</p>
        </Section>
```

**Étape 11.5 — vert, types, lint**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__ src/components/property/__tests__ && npx tsc --noEmit && npx eslint src/components/search)
```

Attendu : tout vert ; `tsc` propre ; ESLint 0 erreur (en particulier aucun `useDebouncedCallback`,
`Tag`, `texteVersFiltre` orphelin). `grep -n "debounceMs\|differe\|surSaisieLibre\|cityDraft" takussan-web/src/components/search/FilterSidebar.tsx` → aucune ligne.

**Étape 11.6 — ablation** : sauvegarder `FilterSidebar.tsx` (+ `md5`) ; dans l'`onChange` de
`ChoixDeVille`, remplacer `location: city === filters.city ? filters.location : undefined` par
`location: filters.location` → **1 rouge** (« retire un quartier qui appartenait à une autre »).
Restaurer par `cp`, `md5` identique.

**Étape 11.7 — signaler à la session** : `FilterSidebar.tsx`, la doublure, les quatre tests du
panneau, les sept tests de page (une ligne chacun ; `PropertiesDiscoveryPage.*` sont des tests de
la page co-tenue) — `feat(web): ville, quartier et équipements choisis dans des listes (TCK-633)`.

---

## Tâche 12 — les essentiels visibles, le reste sous « Plus de filtres »

**Files:**
- Modify: `takussan-web/src/components/search/FilterSidebar.tsx`
- Modify: `takussan-web/src/components/search/__tests__/FilterSidebar.lot-e.test.tsx`

**Étape 12.1 — tests d'abord** (ajout en fin de `FilterSidebar.lot-e.test.tsx`)

```tsx

/**
 * TCK-633 (lot E, AC5) — les essentiels restent visibles (transaction, type, lieu, budget,
 * chambres) ; le reste se replie sous « Plus de filtres ». Un filtre replié ACTIF ouvre le bloc
 * d'office : un filtre actif qu'on ne voit pas serait un filtre qu'on ne peut pas retirer d'ici.
 */
describe('TCK-633 — « Plus de filtres »', () => {
  const ESSENTIELS = ['Type de transaction', 'Type de bien', 'Localisation', 'Autour de moi', 'Budget (FCFA)', 'Chambres'];
  const REPLIES = ['Salles de bain', 'Surface (m²)', 'Meublé', 'État du bien', 'Étage', 'Statut foncier', 'Disponibilité', 'Équipements'];

  it('replié par défaut : les essentiels seuls sont visibles', () => {
    monte();
    for (const titre of ESSENTIELS) expect(screen.getByRole('heading', { name: titre })).toBeInTheDocument();
    for (const titre of REPLIES) expect(screen.queryByRole('heading', { name: titre })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus de filtres' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('les essentiels sont dans l’ordre transaction, type, lieu, budget, chambres', () => {
    monte();
    const titres = ['Type de transaction', 'Type de bien', 'Localisation', 'Budget (FCFA)', 'Chambres']
      .map((nom) => screen.getByRole('heading', { name: nom }));
    for (let i = 1; i < titres.length; i += 1) {
      expect(titres[i - 1]!.compareDocumentPosition(titres[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('déplié : le reste apparaît, et le bouton se referme', () => {
    monte();
    fireEvent.click(screen.getByRole('button', { name: 'Plus de filtres' }));
    for (const titre of REPLIES) expect(screen.getByRole('heading', { name: titre })).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: 'Moins de filtres' });
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(bouton.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('un filtre replié actif ouvre le bloc d’office', () => {
    monte({ bathrooms: 2 });
    expect(screen.getByRole('heading', { name: 'Salles de bain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Moins de filtres' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('replié à la main, le bouton compte les filtres repliés actifs', () => {
    monte({ bathrooms: 2, furnished: false, tags: 'Piscine' });
    fireEvent.click(screen.getByRole('button', { name: 'Moins de filtres' }));
    expect(screen.getByRole('button', { name: 'Plus de filtres (3)' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('un filtre essentiel ne compte pas parmi les repliés', () => {
    monte({ bedrooms: 3, city: 'Dakar', price_min: 1000 });
    expect(screen.getByRole('button', { name: 'Plus de filtres' })).toHaveAttribute('aria-expanded', 'false');
  });
});
```

**Étape 12.2 — rouge** : `npx vitest run src/components/search/__tests__/FilterSidebar.lot-e.test.tsx`
→ attendu : « Unable to find … role "button" and name "Plus de filtres" », et `Salles de bain`
trouvée alors qu'elle devrait être repliée.

**Étape 12.3 — implémentation (Edit, `FilterSidebar.tsx`)**

Import — remplacer

```ts
import { X, RotateCcw, Search, Star, Loader2 } from 'lucide-react';
```

par

```ts
import { X, RotateCcw, Search, Star, Loader2, ChevronDown } from 'lucide-react';
```

Données — ajouter après la fonction `choixVersMeuble` (ancre : sa dernière ligne `  return undefined;\n}`
suivie de la ligne vide et de `/** Délai` disparu — relire et insérer juste après `choixVersMeuble`) :

```ts

/**
 * TCK-633 (lot E, AC5) — les filtres rangés sous « Plus de filtres ». Les essentiels (transaction,
 * fréquence de loyer, type, lieu, autour de moi, budget, chambres) restent visibles.
 */
const CLES_REPLIEES = [
  'bathrooms', 'area_min', 'area_max', 'furnished', 'condition', 'featured',
  'floor_number', 'title_type', 'available_from', 'tags',
] as const satisfies readonly (keyof SearchFilters)[];

function estActif(valeur: unknown): boolean {
  if (Array.isArray(valeur)) return valeur.length > 0;
  return valeur !== undefined && valeur !== '';
}
```

État — ajouter avant `const equipementsChoisis` (ancre : la ligne
`  /** Les équipements choisis, depuis la liste à virgules de l'URL (\`tags=Piscine,Parking\`). */`) :

```ts
  // TCK-633 (lot E, AC5) — « Plus de filtres » : ouvert d'office quand un filtre replié est actif,
  // jusqu'à ce que le visiteur choisisse. Partagé par le rail et le tiroir.
  const idPlusDeFiltres = React.useId();
  const repliesActifs = CLES_REPLIEES.filter((cle) => estActif(filters[cle])).length;
  const [plusOuvertChoisi, setPlusOuvertChoisi] = React.useState<boolean | null>(null);
  const plusOuvert = plusOuvertChoisi ?? repliesActifs > 0;

```

Signature du corps — remplacer

```ts
  const rendreCorps = (rappel?: React.ReactNode) => (
```

par

```ts
  const rendreCorps = (rappel?: React.ReactNode, lieu: 'rail' | 'tiroir' = 'rail') => (
```

et, dans le tiroir, remplacer `{rendreCorps(rappelDeRecherche)}` par
`{rendreCorps(rappelDeRecherche, 'tiroir')}`.

Corps — remplacer **tout ce qui va de la ligne** `        {/* 7. Salles de bain */}` (incluse)
**jusqu'au commentaire** `        {/*\n          Pas de section « Mots-clés »` (exclu) par :

```tsx
        {/*
          TCK-633 (lot E, AC5) — « Plus de filtres ». Le bouton dit combien de filtres repliés sont
          actifs ; le bloc reste monté (`hidden`), ses brouillons de surface ne se perdent pas.
        */}
        <div className="py-4 border-b border-border">
          <button
            type="button"
            aria-expanded={plusOuvert}
            aria-controls={`${idPlusDeFiltres}-${lieu}`}
            onClick={() => setPlusOuvertChoisi(!plusOuvert)}
            className="flex min-h-10 w-full items-center justify-between rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {plusOuvert
              ? t('more.hide')
              : repliesActifs > 0
                ? t('more.showCount', { count: repliesActifs })
                : t('more.show')}
            <ChevronDown
              aria-hidden
              className={`size-4 shrink-0 transition-transform duration-150 ${plusOuvert ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <div id={`${idPlusDeFiltres}-${lieu}`} hidden={!plusOuvert}>
          {/* 7. Salles de bain */}
          <Section title={t(`sections.bathrooms`)}>
            <ChipGroup
              options={BATHROOM_OPTIONS}
              value={filters.bathrooms}
              valeurConfirmee={confirmes.bathrooms}
              onChange={(v) => set({ bathrooms: v as number })}
            />
          </Section>

          {/* 8. Surface */}
          <Section title={t(`sections.area`)}>
            <RangeInputs
              placeholderMin={t('minArea')}
              placeholderMax={t('maxArea')}
              valueMin={areaMinDraft}
              valueMax={areaMaxDraft}
              onChangeMin={setAreaMinDraft}
              onChangeMax={setAreaMaxDraft}
              onCommit={commitImmediat}
            />
          </Section>

          {/* 9. Meublé — TCK-633 : indifférent, oui, non */}
          <Section title={t('furnished.title')}>
            <ChipGroup
              options={meubleOptions}
              value={meubleVersChoix(filters.furnished)}
              valeurConfirmee={meubleVersChoix(confirmes.furnished)}
              onChange={(v) => {
                const suivant = choixVersMeuble(v);
                if (suivant !== filters.furnished) set({ furnished: suivant });
              }}
            />
          </Section>

          {/* 10. État */}
          <Section title={t(`sections.condition`)}>
            <div className="space-y-2">
              {/* TCK-508 — l'état DÉCLARÉ, en multi-sélection comme le type : `condition=new,off_plan`
                  est un OU côté serveur. Un bien qui ne le renseigne pas ne répond à aucun choix. */}
              <div className="flex flex-wrap gap-2 pb-1">
                {conditionValues.map((opt) => {
                  const selected = filters.condition ?? [];
                  const isActive = selected.includes(opt);
                  const attente = enAttente(isActive, (confirmes.condition ?? []).includes(opt));
                  return (
                    <button
                      key={opt}
                      type="button"
                      aria-pressed={isActive}
                      aria-busy={attente || undefined}
                      onClick={() => {
                        const next = isActive
                          ? selected.filter((value) => value !== opt)
                          : [...selected, opt];
                        set({ condition: next.length > 0 ? next : undefined });
                      }}
                      className={`relative min-h-9 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-[background-color,border-color,color,scale] duration-150 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
                        isActive
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                      }`}
                    >
                      {tConditions(opt)}
                      {attente ? <AttenteDePuce /> : null}
                    </button>
                  );
                })}
              </div>

              {/* « En vedette » parle la couleur des badges featured — `--accent`, et rien d'autre
                  (design-guidelines § Couleurs sémantiques). */}
              <button
                type="button"
                aria-pressed={filters.featured === true}
                aria-busy={enAttente(filters.featured === true, confirmes.featured === true) || undefined}
                onClick={() => set({ featured: filters.featured === true ? undefined : true })}
                className={`flex items-center gap-3 w-full text-left px-4 py-3 rounded-xl border transition-colors duration-150 ${
                  filters.featured === true
                    ? 'bg-accent border-accent text-accent-foreground'
                    : 'border-border text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                <Star
                  className={`w-4 h-4 shrink-0 ${
                    filters.featured === true ? 'fill-accent-foreground text-accent-foreground' : 'text-muted-foreground'
                  }`}
                />
                <span className="text-sm font-semibold">{t('featuredOnly')}</span>
                {enAttente(filters.featured === true, confirmes.featured === true) ? (
                  <Loader2 data-attente="bascule" aria-hidden className="ml-auto size-4 shrink-0 animate-spin" />
                ) : null}
              </button>
            </div>
          </Section>

          {/* 11. Étage — un minimum (TCK-633) */}
          <Section title={t(`sections.floor`)}>
            <ChipGroup
              options={floorOptions}
              value={filters.floor_number}
              valeurConfirmee={confirmes.floor_number}
              onChange={(v) => set({ floor_number: v as number })}
            />
          </Section>

          {/* 12. Statut foncier — TCK-491 */}
          <Section title={t(`sections.titleDeed`)}>
            <ChipGroup
              options={titleTypeOptions}
              value={filters.title_type}
              valeurConfirmee={confirmes.title_type}
              onChange={(v) => set({ title_type: v as string })}
            />
            {/* Le statut foncier est sans objet pour un lot dans un immeuble (`field-matrix.ts`) :
                sans ce rappel, un filtre actif sur un appartement se lit comme un catalogue vide
                plutôt que comme un critère hors sujet. */}
            <p className="text-xs text-muted-foreground mt-1.5">{t('titleDeedHint')}</p>
          </Section>

          {/* 13. Disponibilité */}
          <Section title={t(`sections.availability`)}>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">{t('availableFrom')}</label>
              <DatePicker
                value={filters.available_from ?? ''}
                min={new Date().toISOString().slice(0, 10)}
                onValueChange={(value) => set({ available_from: value || undefined })}
                buttonClassName="rounded-xl"
              />
            </div>
          </Section>

          {/* 14. Équipements — TCK-633 : le catalogue approuvé, en multi-sélection. OU côté serveur. */}
          <Section title={t(`sections.amenities`)}>
            <ChoixDEquipements
              valeurs={equipementsChoisis}
              onChange={(noms) => set({ tags: noms.length > 0 ? noms.join(',') : undefined })}
            />
            <p className="text-xs text-muted-foreground mt-1.5">{t('amenityPicker.hint')}</p>
          </Section>
        </div>

```

**Étape 12.4 — vert, types, lint, contraste**

```bash
(cd takussan-web && npx vitest run src/components/search/__tests__ src/components/property/__tests__ && npx tsc --noEmit && npx eslint src/components/search/FilterSidebar.tsx)
(cd takussan-web && npx vitest run src/test/__tests__/surface-publique.contraste.test.ts)
```

Attendu : le premier bloc vert. La garde de contraste (`surface-publique.contraste.test.ts`, **hors
territoire**) rougit au moins sur « l'ardoise correspond couple pour couple à la réalité » : l'entrée
`components/search/FilterSidebar.tsx · text-primary sur bg-primary/5 sur un sous-jacent inconnu (pire pixel 108)`
n'existe plus (c'était la bascule « Meublé uniquement », retirée en Tâche 9). Les fichiers neufs
importés par la page publique (`ChoixDuReferentiel.tsx`, et `ui/combobox.tsx` de D) entrent aussi
dans le périmètre mesuré et peuvent faire bouger `ENCRES_INVERSES` ou ajouter des couples. **Ne pas
éditer ce test** : copier ses messages d'échec mot pour mot dans `collisions` (fichier
`takussan-web/src/test/__tests__/surface-publique.contraste.test.ts`), avec la ligne d'ardoise à
retirer et toute valeur de compte mesurée — la session les consigne avec date et cause, comme
l'exige l'en-tête de la garde.

**Étape 12.5 — ablation** : sauvegarder `FilterSidebar.tsx` (+ `md5`) ; remplacer
`const plusOuvert = plusOuvertChoisi ?? repliesActifs > 0;` par
`const plusOuvert = plusOuvertChoisi ?? false;` → rouges « ouvre le bloc d'office » et, dans
`FilterSidebar.lot-e.test.tsx`, « les équipements s'ajoutent » reste vert (il déplie à la main) ;
`attente-des-puces` « le choix Meublé attend » **rouge** (les puces repliées ne sont plus
accessibles). Restaurer par `cp`, `md5` identique.

**Étape 12.6 — signaler à la session** : `FilterSidebar.tsx`, `FilterSidebar.lot-e.test.tsx` —
`feat(web): panneau — essentiels visibles, le reste sous « Plus de filtres » (TCK-633)`.

---

## Tâche 13 — les puces de catégorie de la barre n'écrasent plus une sélection multiple

**Files:**
- Modify: `takussan-web/src/components/home/Navbar.tsx`
- Create: `takussan-web/src/components/home/__tests__/Navbar.selection-multiple.test.tsx`

**Étape 13.1 — test qui échoue**

```tsx
/**
 * TCK-633 (lot E) — une puce de catégorie de la barre n'ÉCRASE plus une sélection multiple.
 *
 * Le panneau de filtres pose `type=house,villa` ; un clic sur « Appartement » dans la barre
 * remplaçait le tout par `type=apartment`, et le visiteur perdait sa sélection sans un mot. Avec
 * deux types ou plus, la puce AJOUTE ou RETIRE le sien ; seule ou sans sélection, elle reste
 * mono-sélection (remplace, ou retire si elle était la seule) — le comportement de TCK-439.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const push = vi.fn();
let parametresUrl = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => parametresUrl,
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar, prochaineSelectionDeTypes } = await import('@/components/home/Navbar');

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

const puce = (nom: string) => screen.getAllByRole('button', { name: nom })[0]!;

function typesDeLaDerniereUrl(): string | null {
  const url = String(push.mock.calls.at(-1)?.[0] ?? '');
  return new URLSearchParams(url.split('?')[1] ?? '').get('type');
}

describe('prochaineSelectionDeTypes', () => {
  it.each([
    [[], 'villa', ['villa']],
    [['villa'], 'house', ['house']],
    [['villa'], 'villa', []],
    [['house', 'villa'], 'apartment', ['house', 'villa', 'apartment']],
    [['house', 'villa'], 'villa', ['house']],
    [['house', 'villa', 'land'], 'land', ['house', 'villa']],
  ] as const)('%j + %s → %j', (selection, type, attendu) => {
    expect(prochaineSelectionDeTypes(selection, type)).toEqual(attendu);
  });
});

describe('Navbar — une sélection multiple n’est pas écrasée (TCK-633)', () => {
  beforeEach(() => {
    push.mockReset();
  });

  it('les puces de la sélection multiple sont allumées', () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    expect(puce('Maison')).toHaveAttribute('aria-pressed', 'true');
    expect(puce('Villa')).toHaveAttribute('aria-pressed', 'true');
    expect(puce('Appartement')).toHaveAttribute('aria-pressed', 'false');
  });

  it('une puce hors de la sélection s’y AJOUTE', async () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    await userEvent.click(puce('Appartement'));
    expect(typesDeLaDerniereUrl()).toBe('house,villa,apartment');
  });

  it('une puce de la sélection en est RETIRÉE, les autres restent', async () => {
    parametresUrl = new URLSearchParams('type=house,villa');
    monter();
    await userEvent.click(puce('Villa'));
    expect(typesDeLaDerniereUrl()).toBe('house');
  });

  it('un seul type : la puce le remplace (mono-sélection inchangée)', async () => {
    parametresUrl = new URLSearchParams('type=villa');
    monter();
    await userEvent.click(puce('Maison'));
    expect(typesDeLaDerniereUrl()).toBe('house');
  });

  it('un seul type : sa propre puce le retire', async () => {
    parametresUrl = new URLSearchParams('type=villa');
    monter();
    await userEvent.click(puce('Villa'));
    expect(typesDeLaDerniereUrl()).toBeNull();
  });
});
```

**Étape 13.2 — rouge** :
`(cd takussan-web && npx vitest run src/components/home/__tests__/Navbar.selection-multiple.test.tsx)`
→ attendu : `prochaineSelectionDeTypes is not a function`, puis (après l'export seul) `'apartment'`
reçu au lieu de `'house,villa,apartment'` et `aria-pressed="false"` sur « Maison ».

**Étape 13.3 — implémentation (Edit, `Navbar.tsx`)**

Fonction exportée — remplacer

```ts
export function Navbar({ className }: NavbarProps) {
```

par

```ts
/**
 * TCK-633 (lot E) — la sélection de types après un clic sur une puce de catégorie.
 *
 * Deux types ou plus (posés dans le panneau de filtres) : la puce AJOUTE ou RETIRE le sien, elle
 * n'écrase plus la sélection. Aucun ou un seul : mono-sélection, comme avant — la puce remplace,
 * ou retire si elle était la seule.
 */
export function prochaineSelectionDeTypes(selection: readonly string[], type: string): string[] {
  if (selection.length >= 2) {
    return selection.includes(type) ? selection.filter((t) => t !== type) : [...selection, type];
  }
  return selection.length === 1 && selection[0] === type ? [] : [type];
}

export function Navbar({ className }: NavbarProps) {
```

Commentaire de dérivation — remplacer

```ts
  // Derive selection from URL — single source of truth, stays in sync with
  // the FilterSidebar on /properties. activeCategory only highlights when
  // exactly one type is selected; multi-select from the sidebar leaves all
  // navbar chips neutral by design.
```

par

```ts
  // La sélection vient de l'URL — source unique, partagée avec le panneau de filtres de
  // /properties. TCK-633 : chaque puce dont le type est sélectionné s'allume, sélection multiple
  // comprise (elles restaient toutes éteintes, et la barre semblait ignorer la sélection).
```

Supprimer la ligne

```ts
  const categorieDeLUrl = selectedTypes.length === 1 ? selectedTypes[0] : null;
```

Remplacer

```ts
  const [typeDemande, setTypeDemande] = useState<string | null>(null);
  const activeCategory = enNavigation && typeDemande !== null ? typeDemande || null : categorieDeLUrl;
  const moreHasActive = activeCategory !== null && moreCategories.some((c) => c.type === activeCategory);
```

par

```ts
  const [demande, setDemande] = useState<{ readonly cliquee: string; readonly selection: readonly string[] } | null>(null);
  // Les types que la barre ALLUME : la sélection demandée tant que la page suivante n'est pas là,
  // puis celle de l'URL.
  const typesActifs: readonly string[] = enNavigation && demande !== null ? demande.selection : selectedTypes;
  const activeCategory = typesActifs.length === 1 ? (typesActifs[0] ?? null) : null;
  const moreHasActive = moreCategories.some((c) => c.type !== null && typesActifs.includes(c.type));
```

Remplacer

```ts
  const categorieEnAttente: string | null | undefined =
    enNavigation && typeDemande !== null ? typeDemande || null : undefined;
```

par

```ts
  const categorieEnAttente: string | null | undefined =
    enNavigation && demande !== null ? (demande.selection.length > 0 ? demande.cliquee : null) : undefined;
```

Remplacer (dans `handleSearch`)

```ts
    setTypeDemande(null);
```

par

```ts
    setDemande(null);
```

Remplacer le corps de `handleCategoryClick`

```ts
    // Clicking a chip is mono-select: replace ?type= with this single value,
    // or clear it if the chip was already the only active type. This is
    // intentional — the multi-select side lives in the FilterSidebar.
    //
    // Une puce AJOUTE un critère, elle ne réinterprète pas la saisie : tout le reste de l'URL
    // — `q` compris — vient de `buildSearchUrl`, qui est désormais le seul à l'écrire.
    const isOnlyActive = selectedTypes.length === 1 && selectedTypes[0] === type;
    const prochain = isOnlyActive ? '' : type;
    setTypeDemande(prochain);
    demarrerNavigation(() => router.push(buildSearchUrl({ [parametreDe('type')]: prochain })));
```

par

```ts
    // TCK-633 — une sélection MULTIPLE n'est plus écrasée (`prochaineSelectionDeTypes`) ; seule ou
    // sans sélection, la puce reste mono-sélection.
    //
    // Une puce AJOUTE un critère, elle ne réinterprète pas la saisie : tout le reste de l'URL
    // — `q` compris — vient de `buildSearchUrl`, qui est désormais le seul à l'écrire.
    const selection = prochaineSelectionDeTypes(selectedTypes, type);
    setDemande({ cliquee: type, selection });
    demarrerNavigation(() => router.push(buildSearchUrl({ [parametreDe('type')]: selection.join(',') })));
```

Rendu — remplacer **les deux** occurrences (bande et menu « Plus ») de

```ts
                const isActive = activeCategory === cat.type;
```

et

```ts
                    const isActive = activeCategory === cat.type;
```

par, respectivement,

```ts
                const isActive = cat.type !== null && typesActifs.includes(cat.type);
```

et

```ts
                    const isActive = cat.type !== null && typesActifs.includes(cat.type);
```

**Étape 13.4 — vert, et TCK-439 / TCK-580 tiennent**

```bash
(cd takussan-web && npx vitest run src/components/home/__tests__ && npx tsc --noEmit && npx eslint src/components/home/Navbar.tsx)
```

Attendu : tout vert — dont `Navbar.recherche.test.tsx` (AC1 : `${urlLoupe}&type=villa`) et
`Navbar.attente-categorie.test.tsx` (« seule Villa tourne »).

**Étape 13.5 — ablation** : sauvegarder `Navbar.tsx` (+ `md5`) ; remplacer
`if (selection.length >= 2) {` par `if (selection.length >= 99) {` → **4 rouges** (deux cas
multiples de `prochaineSelectionDeTypes`, l'ajout, le retrait). Restaurer par `cp`, `md5` identique.

**Étape 13.6 — signaler à la session** : `Navbar.tsx`, `Navbar.selection-multiple.test.tsx` —
`fix(web): les catégories de la barre n'écrasent plus une sélection multiple (TCK-633)`.

---

## Tâche 14 — vérifications finales et rapport

**Étape 14.1 — backend**

```bash
(cd takussan-api && ./vendor/bin/pint --test && php bin/impacted-tests.php --run)
(cd takussan-api && php artisan test tests/Feature/Search/SearchMinimumFiltersTest.php tests/Feature/Search/MapFiltersParityTest.php tests/Feature/Public/PropertySearchTest.php tests/Feature/PublicPropertySearchFiltersTest.php tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php tests/Feature/Public/PropertyMapTest.php tests/Feature/Public/PropertyMapRadiusTest.php)
```

Attendu : Pint propre ; impact vert (ou `SUITE ENTIÈRE` → ne pas lancer, le noter) ; classes vertes.

**Étape 14.2 — frontend**

```bash
(cd takussan-web && npx tsc --noEmit && npm run lint && npm run check:i18n && node scripts/check-i18n-namespaces.mjs)
(cd takussan-web && npx vitest run src/components/search src/components/home src/components/property src/lib src/types src/test/__tests__/surface-publique.contraste.test.ts "src/app/[locale]/(public)/__tests__/rendu-serveur.test.tsx")
```

Attendu : `tsc` propre, ESLint 0 erreur, `check:i18n` vert, garde des espaces i18n verte (aucun
espace neuf : tout vit sous `search`). Vitest vert **sauf** la garde de contraste (étape 12.4, en
`collisions`). Si `rendu-serveur.test.tsx` (hors territoire, il monte la page avec un
`QueryClientProvider`) rougit à cause des listes du référentiel : `collisions`, avec la ligne
`vi.mock(...)` de l'étape 11.2 f) à y ajouter.

**Étape 14.3 — racine**

```bash
for g in scripts/check-*.mjs; do node "$g" >/dev/null 2>&1 || echo "✗ $g"; done
```

Attendu : aucune ligne `✗` (en particulier `check-test-base-classes`, `check-inline-validation`,
`check-filtering-single-mechanism` : `FiltresDeLaCarte` n'est pas un scope de modèle).

**Étape 14.4 — rapport** (`docs/plans/rapports/tck-633-lot-e.json`, outil Write), dans cet ordre de
clés :

```json
{
  "verdict": "vert | partiel | bloque — et une phrase qui dit pourquoi",
  "fichiers": {
    "crees": ["chemin", "…"],
    "modifies": ["chemin (co-tenu : blocs édités)", "…"]
  },
  "tests": {
    "base_rouge": ["classe ou fichier rouge AVANT toute édition (Tâche 0.8)"],
    "lances": [{ "commande": "…", "resultat": "N passed / N failed", "charge": "uptime 1/5/15 min" }]
  },
  "ablations": [
    { "tache": 1, "fichier": "…", "retrait": "…", "rouges": ["…"], "md5_avant": "…", "md5_apres": "…" }
  ],
  "ecarts_au_ticket": ["…"],
  "collisions": [
    { "fichier": "…", "lot": "C | D | F | session", "besoin": "…", "edition_proposee": "…" }
  ]
}
```

Chaque valeur est **mesurée** pendant l'exécution (sorties de commande, empreintes `md5`), jamais
recopiée de ce plan.

**Étape 14.5 — signaler à la session** la liste complète des fichiers (créés, modifiés, co-tenus
avec leurs blocs) et les collisions. Message final de l'agent, **une ligne** :
`lot E : <verdict>, <N> fichiers, <N> ablations, collisions : <liste courte>`.

---

## Écarts relevés (en lisant le code, le 2026-10-12)

1. **Le paramètre d'étage s'appelle `floor_number`, pas `floor`** (`SearchPublicPropertyRequest::rules()`,
   `PropertySearchService::buildFilter()`, `types/search.ts`). Le plan l'emploie partout.
2. **Ce que le passage en minimum rougit, et ce qu'il ne rougit pas.**
   `PublicPropertySearchFiltersTest::test_floor_number_filter_returns_matching_properties` et le jeu
   `floor_number` de `SavedSearchCriteriaVocabularyTest` rougissent (B à l'étage 5 répond à « 2 et + ») ;
   `PropertySearchTest::test_filter_by_bedrooms` resterait **vert** (biens à 1 et 3, seuil 3 : il
   n'affirmait pas l'égalité) — il est réécrit pour affirmer le minimum, sinon il ne garderait rien.
3. **Les alertes passent aussi en minimum** : `alertMatches()` réutilise `buildFilter()`. C'est
   cohérent avec le chemin haversine (`App\Services\Model\SearchService`), qui lisait déjà
   `bedrooms >=` — les deux chemins d'alerte divergeaient donc avant ce lot. Épinglé par
   `SearchMinimumFiltersTest::test_une_alerte_cinq_chambres_et_plus_capte_la_maison_de_six`.
4. **`/map` exige une édition hors territoire.** La carte est en SQL (`PublicPropertyController::map()`,
   ADR-0023), et appliquer les filtres demande de remplacer un bloc de 12 lignes de ce contrôleur,
   co-tenu par C et F et **absent** du territoire E. **Proposition à la session, avant de lancer E :**
   ajouter E à la ligne des co-tenus du plan maître —
   `| app/Http/Controllers/Public/PublicPropertyController.php | C, E, F | C : contact() ; E : filtres de map() (bloc type/contrat/prix → FiltresDeLaCarte) ; F : tri de la liste publique |`.
   Sans cela, la Tâche 4 s'arrête à l'étape 4.3 (Tâche 0, étape 0.7).
5. **AC6 tenu pour les filtres du panneau, pas pour `q`.** Appliquer la recherche plein-texte à `/map`
   obligerait à recomposer Scout et Eloquent dans un second chemin, ce que `takussan-api/CLAUDE.md`
   (§ Recherche) interdit et que `check-filtering-single-mechanism.mjs` (contrôle D) garde. `q` reste
   propre à la liste (`CLES_PROPRES_A_LA_LISTE`), comme avant (le commentaire M3 de la page le disait
   déjà). Autre différence **préexistante** : un bien sans coordonnées est compté par la liste et
   jamais par la carte (`bounds` exige latitude et longitude). À dire au porteur si « même compte » est
   lu littéralement.
6. **Le catalogue des équipements n'est pas lisible sans compte.** `routes/api/tags.php` est
   entièrement sous `auth:sanctum` : `GET /api/tags?filter[type]=amenity&filter[status]=approved`,
   l'interface D → E du plan maître, rend **401** au visiteur anonyme du site public, et
   `Tag::$requestFilterable` ne contient que `type` (sans `status`, spatie lève
   `InvalidFilterQuery`, 400). L'interface du plan maître est muette sur les deux. D doit ouvrir la
   lecture du catalogue approuvé (ou exposer une route publique, auquel cas seul le chemin de
   `useEquipementsApprouves` change) et déclarer `status` filtrable. Vérifié en Tâche 0, étape 0.4.
7. **La primitive combobox n'a pas d'API fixée par le plan maître.** Ce plan l'écrit contre la
   primitive shadcn `base-nova` (relevée le 2026-10-12 : `Combobox`, `ComboboxInput{showClear}`,
   `ComboboxContent{anchor}`, `ComboboxList`, `ComboboxItem`, `ComboboxEmpty`, `ComboboxChips`,
   `ComboboxChip{showRemove}`, `ComboboxChipsInput`, `ComboboxValue`, `useComboboxAnchor`), qui
   s'appuie elle-même sur `components/ui/input-group.tsx`. L'option « créer » (D) n'est pas employée
   par la recherche. Un seul fichier l'importe (`ChoixDuReferentiel.tsx`) : si D livre autre chose,
   seul lui change. Et `GET /api/public/geo/cities` doit accepter l'absence de `region` (le panneau
   liste toutes les villes).
8. **`tags` est un OU côté serveur** (`tags = 'X'` en tableau imbriqué, `buildFilter()` l. 519-525) ;
   le ticket ne tranche pas entre ET et OU. Conservé, et **dit** dans l'interface
   (« Biens offrant au moins un des équipements choisis »). À confirmer par le porteur.
9. **Libellés d'étage minimum** — « RDC et + », « 1er et + » … « 4e et + » : choix de ce plan, à
   relire par le porteur. Le sens de « 4e+ » (valeur 4) n'était vrai qu'à moitié sous l'égalité :
   il ne trouvait que le 4e étage.
10. **Ordre des essentiels** : le ticket nomme « transaction, type, budget, chambres, lieu » sans
    imposer d'ordre ; le plan garde l'ordre actuel du panneau (transaction, fréquence de loyer si
    location, type, lieu, autour de moi, budget, chambres). « Autour de moi » reste avec le lieu :
    son message de refus renvoie au champ « Ville » juste au-dessus (`AutourDeMoi.tsx`). La fréquence
    de loyer reste visible, conditionnelle à « Louer ».
11. **« Louer avant Acheter » apparaît aussi au lot A dans le ticket** ; le territoire du panneau de
    filtres est E (plan maître). E ne touche ni le sélecteur de la barre (lot A) ni
    `property.contractTypes` (autre espace) : le panneau emploie ses propres clés
    `search.filters.transaction.*`.
12. **La garde de contraste rougit par conséquence du retrait de « Meublé uniquement »** — l'entrée
    `components/search/FilterSidebar.tsx · text-primary sur bg-primary/5 …` de
    `src/test/__tests__/surface-publique.contraste.test.ts` ne correspond plus à rien, et
    `ChoixDuReferentiel.tsx` comme `ui/combobox.tsx` entrent dans la surface publique mesurée. Fichier
    hors territoire : la session le met à jour avec date et cause (Tâche 12, étape 12.4).
13. **Les tests de page montent `PropertiesDiscoveryPage` sans `QueryClientProvider`.** Les listes du
    référentiel passant par React Query (convention du dépôt), sept tests de page reçoivent une ligne
    `vi.mock` vers une doublure partagée. Écarté : un `apiFetch` en effet (précédent : la barre, pour
    `/public/property-types`), qui aurait évité ces lignes mais contourné le store serveur unique.
14. **Clés i18n devenues sans lecteur** : `search.filters.cityPlaceholder`, `quarterPlaceholder`,
    `furnishedOnly`, `amenitiesPlaceholder`, `amenitiesHint`, et `search.tags.bedrooms`, `bathrooms`,
    `groundFloor`, `floor`. Laissées en place (aucune garde ne refuse une clé orpheline, et `search.tags`
    n'est pas qu'à E) ; à retirer à l'intégration si la session le souhaite.
15. **Commentaires périmés hors territoire** : `components/map/PropertyMap.tsx:122` et
    `lib/queries/properties.ts:168` décrivent encore les filtres de la carte comme « type,
    contract_type, price ». À corriger par la session (ou le lot qui tient ces fichiers).
16. **La puce `tags` reste « Tags : piscine,parking »** (une puce pour la liste entière, retirée d'un
    coup) : l'éclater par équipement, comme `type`, est hors périmètre du ticket.
17. **`hooks/useSearch.ts` et `SearchToolbar.tsx`, au territoire E, ne changent pas** : relus, les
    libellés de puce viennent de `types/search.ts`, et `filtersToParams` écrit déjà les listes à
    virgules que la carte attend.
