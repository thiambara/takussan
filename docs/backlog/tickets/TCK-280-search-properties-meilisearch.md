---
id: TCK-280
title: "Recherche de biens sur Meilisearch (public + dashboard)"
status: todo
phase: P2
family: back
estimate: L
created: 2026-05-20
updated: 2026-05-20
depends_on: [TCK-052]
blocks: [TCK-281]
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, search, scout, meilisearch, property]
---

## Objectif utilisateur

Un visiteur ou un agent qui cherche un bien obtient des résultats tolérants aux
fautes de frappe et classés par pertinence, sans dégradation des facettes ni du
tri existants.

## Contrat de données

- Endpoint existant `GET /api/public/properties/search` — contrat de réponse
  `{data, facets, meta}` **inchangé**.
- Listing dashboard `GET /api/properties` — `filter[search]` inchangé côté
  contrat (cf. `spec_refs`).
- Modèle `Property` — porte déjà le trait `Searchable` ; index `properties`.
- `config/scout.php` — index-settings `Property::class` à compléter
  (filterable / sortable / `rankingRules`).
- Référence : `docs/models-spec.md#3-property` pour la liste des colonnes ;
  `docs/spatie-query-builder.md` pour le contrat `filter[]`.

## Direction UX / Artistique

N/A — ticket backend. La réponse JSON ne change pas ; aucun fichier frontend
(`useSearch.ts`, `SearchAutocomplete`, page `/properties`) n'est modifié.

## Contraintes strictes (métier)

- Le contrat de réponse `{data, facets, meta}` doit rester structurellement
  identique — la migration est invisible pour le frontend.
- `meta.total` doit refléter le **vrai** total filtré ; aucun filtrage appliqué
  après Meilisearch (sinon pagination et total faux — régression TCK-094).
- Les biens `Draft` ou non publics ne doivent jamais apparaître
  (`shouldBeSearchable()` + filtre de requête).
- Tri : `relevance` = pertinence Meilisearch ; `price_asc` / `price_desc` /
  `created_desc` = tri explicite dominant sur la pertinence.
- CI tourne sur le `CollectionEngine`, prod sur Meilisearch — les tests doivent
  rester verts sur les deux moteurs.

## Delta à produire

- [ ] Compléter `Property::toSearchableArray()` — aplatir l'adresse
      (`city`, `neighborhood`, `latitude`/`longitude` → `_geo`), `tags`, et
      tous les champs filtrables/triables.
- [ ] Compléter `config/scout.php` index-settings `Property::class` :
      `filterableAttributes`, `sortableAttributes`, `rankingRules` (`sort` en
      tête pour que le tri explicite domine).
- [ ] Réécrire `PublicPropertyController::search` — `Property::search($q)` +
      filtres Scout natifs (`where`, `whereIn`, range) + recherche géo
      (bounding-box / rayon) via les filtres géo Meilisearch.
- [ ] Facettes — remplacer les 3 requêtes `GROUP BY` par les facettes natives
      Meilisearch, avec fallback `CollectionEngine` si nécessaire.
- [ ] Rendre le callback `filter[search]` de `HasQueryBuilder` Scout-aware :
      router via le scope `withSearch()` quand le modèle est `Searchable`,
      fallback `LIKE` sinon — bénéficie immédiatement au listing dashboard des
      biens et prépare TCK-281.
- [ ] Conserver `applySearchFilter` / `orderBySearchRelevance` uniquement comme
      fallback driver `collection`, ou les retirer si le `CollectionEngine`
      couvre le besoin.
- [ ] Documenter `php artisan scout:import "App\Models\Property"` pour le
      premier déploiement.
- [ ] Tests : `PublicPropertySearchTest` (pertinence, facettes, tri, géo,
      pagination + `total`) verts sur `collection` et `meilisearch`.

## Critères d'acceptation

- [ ] AC1 — `GET /public/properties/search?q=appartemnt` (faute volontaire)
      renvoie les appartements en tête de liste.
- [ ] AC2 — `facets` et `meta.total` restent corrects et cohérents avec les
      filtres appliqués.
- [ ] AC3 — `sort=price_asc` trie strictement par prix croissant, la pertinence
      ne perturbe pas l'ordre.
- [ ] AC4 — La recherche géo (bounding-box + rayon) ne renvoie que les biens
      situés dans la zone demandée.
- [ ] AC5 — Le `filter[search]` du listing dashboard passe par Scout et reste
      scopé à l'agence appelante.
- [ ] AC6 — Le contrat JSON `{data, facets, meta}` est inchangé ; aucun fichier
      frontend n'est modifié.
- [ ] AC7 — La suite de tests passe sur `CollectionEngine` (CI) et
      `MeilisearchEngine`.

## Hors périmètre

- Recherche des autres entités (clients, agences, utilisateurs, maintenance)
  → TCK-281.
- Autocomplétion `SuggestService` — reste sur le cache mémoire.
- Recherche sémantique par embeddings (§2.4, P3).
- Installation / configuration de Meilisearch sur le VPS — déjà documentée
  (`docs/configuration.md §3.6`, `docs/infra/deploy-preview.html §6.4`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
