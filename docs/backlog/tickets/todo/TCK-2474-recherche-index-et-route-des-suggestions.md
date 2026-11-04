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

_(à remplir)_
