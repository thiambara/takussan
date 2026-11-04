---
id: TCK-2474
title: "Recherche : un index dédié aux suggestions et une route qui rend, en une requête, la saisie comprise, les recherches populaires, les lieux et trois biens"
status: todo
phase: P2
family: back
estimate: L
wave: 81
created: 2026-11-04
updated: 2026-11-04
depends_on: [TCK-2473, TCK-2472]
blocks: [TCK-2475, TCK-2476]
spec_refs:
  features:
    - "docs/features.md"
  models: []
tags: [api, search, suggestion, meilisearch, adr-0088]
---

## Objectif utilisateur

À chaque frappe, le visiteur voit en moins d'un battement de cil ce que Takussan a compris, les recherches qui marchent,
les lieux, et déjà trois biens.

## Contexte (mesuré, `SuggestService`)

La suggestion actuelle fait deux allers-retours Meilisearch (`facetSearch` + `multiSearch`) et ne rend que des termes
isolés ; le préfixe seul, pas de faute sous 5 caractères (`dakr` → rien), rien à vide.

## Contrat de données

**Index Meilisearch** `search_suggestions` (préfixé comme les autres index : par le préfixe Scout configuré, que le
harnais de tests isole — re-mesurer `TestSearchIndex`) ; un document par entrée :
`{id, kind: city|neighborhood|property_type|query|alias, label_fr, label_en, label_wo, aliases[], value, city, criteria,
weight}`. Réglages : `searchableAttributes` [`label_fr`, `label_en`, `label_wo`, `aliases`], `filterableAttributes`
[`kind`], `sortableAttributes` [`weight`], `typoTolerance.minWordSizeForTypos` = `{oneTypo: 4, twoTypos: 8}`, règles de
classement avec `weight:desc` après `exactness`. Sources : villes et quartiers du catalogue public avec leur nombre de
biens (`weight`), types (`trans` fr/en/wo + synonymes de TCK-2473), recherches populaires (`SearchJournal::popular`,
TCK-2472), alias actifs (TCK-2476, table absente = aucun).

**Construction** `App\Services\Search\Suggestions\SuggestionIndexBuilder` + commande `search:build-suggestions` (toutes
les heures, `routes/console.php`, commentaire `TCK-2474` d'idempotence : construit un index temporaire puis l'échange —
`swapIndexes` — jamais d'index à moitié rempli servi). Lancée aussi par `docker/release.sh` si l'index est absent
(re-mesurer le mécanisme `.search-shape`).

**Route** `GET /api/search/suggest?q=&limit=` (inchangée : `throttle:search-suggest`, `Cache-Control: public,
max-age=60`, `Vary: Accept-Language`). Réponse — les clés existantes restent pour le front actuel, les nouvelles s'ajoutent :

```json
{ "data": {
  "interpretation": null | { "criteria": {"type":"apartment","bedrooms":3,"location":"Almadies","city":"Dakar","price_max":500000},
                             "parts": [{"key":"type","value":"apartment"}, …], "residue": null, "count": 12 },
  "completions":  [{ "text": "appartement meublé almadies", "criteria": {…}, "count": 34 }],
  "popular":      [{ "text": "…", "criteria": {…}, "count": 0 }],
  "places":       [{ "kind": "neighborhood", "label": "Almadies", "city": "Dakar", "count": 41 }],
  "previews":     [{ "id": 1, "slug": "…", "title": "…", "price": 450000, "rent_period": "monthly", "contract_type": "rent",
                     "neighborhood": "Almadies", "city": "Dakar", "photo_url": "…" }],
  "cities": […], "neighborhoods": […], "property_types": […]
}}
```

- `q` vide : `popular` (au plus 6) seul rempli, le reste vide.
- `interpretation` : présente si `ParsedQuery::understood` ; `count` et `previews` (au plus 3) viennent d'UNE recherche de
  l'index des biens sous ses critères + le filtre public (`PropertySearchService::publicFilter()` et la traduction des
  critères en filtre — réutiliser celle de `/search`, jamais la recopier : le compte promis doit être celui que la liste
  rendra). Sans interprétation, `previews` = les 3 premiers biens de la recherche plein texte.
- `parts` : valeurs seulement, **jamais de libellé** (le front possède le texte, principe n°5).
- `photo_url` : par `PublicPhotoUrl::upTo()` (jamais l'original).
- Tout en **un seul** `multiSearch` (index des suggestions + index des biens).

## Contraintes strictes (métier)

- Les comptes ne promettent que ce que la liste rend (même filtre public, mêmes critères).
- Une recherche populaire n'est rendue que sous les règles d'ADR-0088 (≥ 5 visiteurs un même jour, résultats > 0).
- Temps serveur visé : p95 < 80 ms sur la base de démonstration locale (mesure écrite dans les Notes, avec la charge).
- Les tests de recherche portent `InteractsWithMeilisearch` (sans lui, rien n'est indexé — `CLAUDE.md` de l'API).

## Delta à produire

- [ ] Index, builder, commande, planification ; `SuggestService` étendu (ou remplacé derrière la même route, sans casser
      `SuggestRequest` ni les tests existants qu'on garde verts).
- [ ] Tests : `SuggestionIndexBuilderTest`, `SuggestInterpretationTest` (AC ci-dessous), `SuggestPopularTest`,
      `SuggestPreviewsTest`, les tests existants de la suggestion.

## Critères d'acceptation

- [ ] AC1 — `q=appart 3ch almadies` rend `interpretation.criteria` attendu et `count` égal au total de `/api/properties`
      sous les mêmes paramètres.
- [ ] AC2 — `q=dakr` rend Dakar dans `places` (une faute à 4 caractères).
- [ ] AC3 — `q=` rend `popular` (recherches du journal au-dessus du seuil seulement).
- [ ] AC4 — Les clés `cities`, `neighborhoods`, `property_types` gardent leur forme (le front actuel continue de marcher).

## Hors périmètre

- L'interface : TCK-2475. Les alias tenus par l'IA : TCK-2476.

## Notes d'implémentation

### Re-mesures (2026-11-04)

- **Route de la liste** : `GET /api/public/properties/search` (le ticket dit `/api/properties`, cf. TCK-2472). AC1 compare
  à elle.
- **`SuggestService` = 3 appels moteur, pas 2** : `facetSearch(city)` + `facetSearch(neighborhood)` + un `multiSearch`
  (ventilation des quartiers par ville). Inchangé, il sert toujours `cities`, `neighborhoods`, `property_types`.
- **Les clés anciennes ne peuvent pas venir du nouvel index sans casser des tests qu'on garde** : `SearchSuggestTest` et
  `SuggestServiceTest` épinglent « `aprt` → aucun type sous 5 caractères » (TCK-507) et
  `resolve('   ')` === exactement les trois clés vides. L'index neuf admet une faute dès 4 (AC2) : les deux seuils se
  contredisent. Décision : `SuggestService` est **gardé tel quel** derrière la même route ; les clés neuves viennent
  d'un service neuf, `App\Services\Search\Suggestions\SearchSuggestions`, en **un seul `/multi-search`** ; le
  contrôleur fusionne les deux. Les anciennes clés (et leurs 3 appels) se retirent avec le front actuel (TCK-2475).
- **`.search-shape`** ne couvre que les index de modèles (Dockerfile : `config/scout.php`, modèles `toSearchableArray`,
  `app/Support/Search`, `lang/fr/properties.php`) ; `search:verify-indexes` et `search:sync-index-settings` ne lisent que
  les index déclarés dans `config/scout.php`. L'index des suggestions n'y est PAS déclaré (le déclarer changerait
  l'empreinte et réimporterait tous les modèles au déploiement suivant) : ses réglages sont posés par le constructeur
  sur chaque index neuf (`SuggestionIndex::settings()`).
- **Isolation des tests** : l'uid est `scout.prefix` + `search_suggestions`, donc `testing_<jeton>_search_suggestions`,
  supprimé avec les autres en fin de processus (`TestSearchIndex` balaie tout le préfixe). ⚠ `InteractsWithMeilisearch`
  ne le VIDE pas entre deux tests d'un même processus (il ne vide que les index de modèles) : chaque test qui le lit le
  reconstruit d'abord (`Tests\Concerns\BuildsSearchSuggestions::buildSuggestions()`).
- **Meilisearch 1.16** : `/swap-indexes` exige que les deux index existent ; le premier passage crée l'index servi vide
  juste avant l'échange.
- **Alias TCK-2476** : table absente aujourd'hui → aucun. Le constructeur lit `search_aliases` (colonnes du contrat de
  TCK-2476 : `alias`, `target_kind`, `target_value`, `target_city`, `status`) si elle existe — éprouvé par un test qui
  crée la table.

### Décisions

1. **Documents** : aux champs du ticket s'ajoute `count` (total de la liste sous `criteria` au moment de la
   construction) ; `weight` = `count` pour un lieu ou un type, la popularité (visiteurs-jours de `popular()`) pour une
   recherche populaire. **Tous les `count` de la réponse sont des nombres de BIENS**, jamais de visiteurs : celui d'une
   recherche populaire est recompté à la construction par `nominalQuery(criteria + q)` ; une entrée à 0 bien n'entre pas.
2. **Comptes = la liste, par construction** : `PropertySearchService::nominalQuery(array $params, int $hitsPerPage):
   SearchQuery` (nouvelle méthode publique, ajout pur : `search()` n'est pas modifiée) rend la page 1 du régime nominal
   — `buildFilter()`, `buildSort()`, `matchingStrategy: all`. Le constructeur compte chaque lieu/type/recherche avec
   elle ; la suggestion en tire `interpretation.count` et `previews`.
3. **Écart assumé** : sous un résidu de ≥ 2 mots qui rend 0, la liste élargit (ADR-0024, `search.strategy = widened`)
   et son `meta.total` est celui de l'élargissement ; `interpretation.count` dit **0** (ne promet que l'exact).
   Épinglé par `SuggestInterpretationTest::test_le_compte_ne_promet_que_le_resultat_exact`. À trancher par la
   session si l'on préfère promettre le total élargi.
4. **Lieux** : cherchés sur le RÉSIDU quand la saisie est comprise (« appart 3ch alm » → Almadies), sinon sur le texte de
   la part `location`/`city` comprise (« appart almadies » → Almadies reste proposé), sinon sur la saisie entière.
   Sous `all`, la saisie entière ne rendait aucun lieu dès qu'un critère la précédait.
5. **Regroupement des lieux** : par `CleDeQuartier` (la clé du filtre `location`). Libellé d'un quartier = nom du
   référentiel (`DatabasePlaceLexicon::entries()`) s'il existe, sinon l'écriture la plus fréquente ; libellé d'une ville =
   écriture la plus fréquente des ADRESSES (le filtre `city` compare ce texte). Autres écritures → `aliases`.
6. **`parts`** : `{key, value, from, to}` — `from`/`to` (positions en caractères) gardés pour le surlignage du front ;
   aucun libellé.
7. **`criteria`** toujours un objet JSON (`{}` quand vide, jamais `[]`).
8. **Recherche populaire par critères seuls** (`text` = `''`) : proposée à saisie vide, le front la rend depuis
   `criteria`.
9. **Sans index** (avant le premier passage) : la requête des biens est rejouée seule — interprétation et previews
   servies, `places`/`completions`/`popular` vides, pas de 500.
10. **Planification** : `->hourly()->withoutOverlapping(60)` ; idempotente (index temporaire `<uid>_build_<aléa>`, puis
    `swapIndexes`, puis suppression ; les index de construction de plus d'une heure sont balayés).
11. **`docker/release.sh`** : `php artisan search:build-suggestions --if-missing` à la fin du bloc Meilisearch, APRÈS
    l'importation dont il lit les comptes ; un échec n'arrête pas le déploiement (la barre sert alors l'interprétation et
    les biens). `scripts/test-release-reindex.sh` reste vert (32 vérifications) ; il n'a pas de scénario pour cette ligne.

### Temps serveur (mesuré 2026-11-04, base locale de démonstration, 8 cœurs, load 8,7 / 9,0 / 6,3 — machine CHARGÉE)

50 saisies variées (`''`, préfixes de « appart 3ch almadies », `dakr`, `mrmoz`, `f3 ngor à louer`, …), requête complète
par le noyau HTTP (`app()->handle()`, middlewares compris), après échauffement : **p50 15,5 ms · p95 33,4 ms** (2ᵉ passage :
16,2 / 33,7). Part neuve seule (`SearchSuggestions::resolve`) : p50 9,8 ms · p95 25,0 ms ; part ancienne (`SuggestService`) :
p50 1,7 · p95 4,8. Objectif p95 < 80 ms tenu. Construction de l'index local : 37 documents (10 villes, 17 quartiers,
10 types), < 1 s.

### À reporter dans les specs

- `docs/features.md` (barre de recherche) : la réponse de `GET /api/search/suggest` (clés neuves, sémantique des
  `count`, `popular` à saisie vide seulement, au plus 6 ; `previews` au plus 3 ; lieux sur le résidu) ; la commande
  `search:build-suggestions` (horaire, `--if-missing` au déploiement) ; l'écart du compte sous recherche élargie.
- `docs/models-spec.md` : aucun modèle (index Meilisearch seul) — éventuellement une ligne sur l'index
  `search_suggestions` et ses documents.

### Revue adverse du 2026-11-04 — correctifs (n° 5, 6)

- 2026-11-04 — **n° 5, la base** : `GET /api/search/suggest` accepte les filtres de la liste publique, mêmes noms et
  même validation (`SuggestRequest` étend `SearchPublicPropertyRequest`, `BASE_KEYS` : contrat, type, période, lieux,
  prix, chambres, salles de bain, surface, meublé, vedette, étage, titre, état, équipements, disponibilité, géo, `sort`).
  **Règle de fusion** : un critère compris dans la saisie REMPLACE la même clé de la base ; les clés de la base absentes
  de la saisie sont gardées. `interpretation.count` et `previews` se calculent sur la fusion ; `interpretation.criteria`
  reste ce que la saisie a compris (le front fusionne de son côté par la même règle). **n° 6** : `throttle:search-suggest`
  passe de 60 à 300/min (`SearchSuggestions::RATE_PER_MINUTE`). Tests : `SuggestInterpretationTest`, `SearchSuggestTest`.
- 2026-11-04 — **exception de fusion, la ville** : une `city` comprise dans la saisie retire AUSSI `location` et
  `region` de la base — comme la navigation de la liste (TCK-439, TCK-635) : « villa saly » depuis une liste filtrée sur
  Almadies cherche à Saly, pas « Saly ET Almadies ». Les autres clés de la base restent. Test :
  `SuggestInterpretationTest::test_une_ville_comprise_retire_le_quartier_et_la_region_de_la_base`.
- 2026-11-04 — **`interpretation.widens: bool`** : vrai quand la liste publique élargira la même saisie (ADR-0024),
  calculé par le MÊME code que `PropertySearchService::search()` — `PropertySearchService::wouldWiden($résidu,
  $totalHits)`, soit `totalHits === 0 && count(usefulTerms(résidu)) >= 2`. Le front peut dire « aucun résultat exact,
  la liste élargira » au lieu de « 0 ». Test : `SuggestInterpretationTest::test_widens_dit_si_la_liste_elargira`
  (l'ablation de `wouldWiden` le rougit, celle de son seuil aussi).
- 2026-11-04 — **4a, `cities` et `neighborhoods` quittent la réponse** : `places` (l'index des suggestions) les
  remplace ; `SuggestService` ne garde que `property_types` et n'appelle plus le moteur (deux `facet-search` de moins par
  frappe). Les tests qui les épinglaient vérifient leur absence (`SearchSuggestTest::test_les_anciennes_cles_cities_et_neighborhoods_ont_quitte_la_reponse`,
  `SuggestPopularTest`, `SuggestInterpretationTest::ac4`), et les cas ville / quartier / faute de frappe se rejouent sur
  `places`. Latence mesurée en local (machine chargée, 8 saisies × 30, alterné) : p50 −3 à −5 ms, p95 sans écart
  lisible (29–34 ms avant comme après) — le p95 est tenu par les requêtes de `SearchSuggestions`.
