---
id: TCK-1220
title: "Cinq listes rendent l'enveloppe de pagination de Laravel (`links`, `meta.path`), hors de `PaginationMeta`, avec des URL tirées de l'hôte de la requête"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#cinq-listes-rendent-lenveloppe-de-pagination-de-laravel-hors-de-paginationmeta-avec-des-url-tirées-de-lhôte-de-la-requête"
  conventions:
    - "takussan-api/CLAUDE.md#pagination--la-forme-canonique"
tags: [api, pagination, pistes]
---

## Contexte

Réf : **P108.03** du fichier de pistes, `retenu · autonome` (A1). Cinq actions rendent
`XResource::collection($paginator)` tel quel : `PublicPropertyController::index`,
`PublicAgencyController::properties`, `PublicAgentController::properties`,
`BankStatementController::index`, `BankStatementLineController::index`. Laravel y ajoute `links`
(`first`, `last`, `prev`, `next`) et un `meta` à lui (`path`, `links`, `from`, `to`), hors de
`PaginationMeta` (TCK-304), avec des URL tirées du schéma, de l'hôte et du port de la requête :
l'hôte interne sur le chemin du front, que `forceRootUrl` (TCK-1058) ne corrige pas. Aucun lecteur
au front.

## Objectif

Les cinq listes rendent `{ data, meta }`, `meta` réduit aux quatre clés canoniques, `data`
inchangé.

## Delta à produire

- [x] Les cinq actions passent par `$this->paginated($paginator, XResource::collection($paginator)->toArray($request))`,
      la forme de `takussan-api/CLAUDE.md` § « Pagination ».
- [x] `BankStatementController` et `BankStatementLineController` étendent `Base\Controller` (ils
      étendaient l'ancien `App\Http\Controllers\Controller`, qui n'a ni `json()` ni `paginated()`).
- [x] Garde : `tests/Feature/Http/EnveloppeDePaginationDesListesDeRessourcesTest.php`, un cas par
      route (relevés et lignes ensemble).

## Critères d'acceptation

- [x] AC1 — Chaque route rend exactement les racines `data` et `meta`, et `meta` porte les seules
      clés de `PaginationMeta::KEYS`.
- [x] AC2 — `data` garde la forme d'avant : aucun `whenHas()` non satisfait ne sort en `{}`.

## Hypothèses

- La piste offrait deux gardes (étendre `check-pagination-envelope.mjs`, ou un test qui refuse
  `links` sur ces routes). Choix : **le test**, la voie la plus étroite ; il ne garde que ces cinq
  routes, pas une sixième écrite demain sous la même forme.

## Hors périmètre

- `PublicPropertyController::similar` et `PaymentSearchController`, qui rendent une collection non
  paginée (pas d'enveloppe de Laravel), et `PropertySearchService` (`resolve()` sur une
  collection).
- Les autres contrôleurs de `Api/Accounting/` qui étendent encore l'ancien `Controller`.

## Notes d'implémentation

- `ResourceCollection::toArray()` résout chaque élément (`map->resolve()`) quand il contient des
  `JsonResource` : la forme canonique filtre les `MissingValue` comme la réponse de Laravel. Mesuré
  par une capture temporaire de `data` avant et après le correctif, sur les quatre premiers appels
  du test : mêmes clés partout, seules les valeurs tirées par les fabriques diffèrent.
- Ablation (2026-10-22) : `app/` rendu à `pre-dev` → les 4 tests rougissent (racines
  `data, links, meta`) ; correctif remis → 4 verts.
