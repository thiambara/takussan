---
id: TCK-967
title: "Les contrôleurs rendent une ressource unique par resolve(), plus par toArray()"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#des-réponses-construites-par--toarrayrequest-direct-laissent-passer-les-attributs-conditionnels-non-résolus"
tags: [back, resources, contract, pistes]
---

## Contexte

Réf : **P45.04** du fichier de pistes, `retenu · autonome` (A1, A5).

`XResource::make($m)->toArray($request)` saute `JsonResource::resolve()`, donc `filter()` : un
`whenLoaded()` sur une relation non chargée ou un `when()` faux restent des `MissingValue`, rendus
en `{}` au lieu d'omettre la clé. Le contrat est celui de `whenLoaded()`/`when()` (clé omise), déjà
appliqué par TCK-952 et gardé par `ParticipantRoleResponseShapeTest`. Mesuré par le mesureur :
`POST /api/public/properties/{slug}/visit-request` rendait `"property":{},"visitor":{},…`.

## Objectif

Aucun contrôleur ne rend une ressource unique sans la résoudre, et une garde l'empêche de revenir.

## Hypothèses (mode sans humain)

- Les appels sur `::collection(…)` ne sont pas touchés : `ResourceCollection::toArray()` résout
  déjà chaque élément (mesureur), et `resolve()` y ré-indexerait une liste à clés trouées.
- La garde est textuelle, sur `app/Http/Controllers` seulement, comme `PerPageBorneTest`.

## Delta à produire

- [x] Les 147 `->toArray($request)` sur `::make(…)` ou `new …Resource(…)` de 45 contrôleurs passent
  à `->resolve($request)`.
- [x] `tests/Unit/Architecture/RessourceUniqueResolueTest.php` : la garde et son auto-test.
- [x] `tests/Feature/Public/VisitRequestResponseShapeTest.php` : la réponse mesurée omet ses
  relations non chargées.

## Critères d'acceptation

- [x] AC1 — `POST …/visit-request` ne rend ni `property`, ni `visitor`, ni `agent`, ni `customer`
  quand ils ne sont pas chargés, et aucun `{}`.
- [x] AC2 — la garde refuse `::make(…)->toArray($request)`, `new …Resource(…)->toArray($request)`
  et la forme sur plusieurs lignes ; elle laisse passer `::collection(…)->toArray($request)`.
- [x] AC3 — les tests des contrôleurs touchés restent verts.

## Hors périmètre

- Les `->toArray($request)` hors de `app/Http/Controllers` (services, notifications).
- Les appels sur une collection.

## Notes d'implémentation

- Avant correctif : la garde relève 147 fautes dans 45 contrôleurs ; `VisitRequestResponseShapeTest`
  rougit (`data.property` présent, `{}`).
- Ablation : `app/` retiré → ces 2 rouges ; remis → verts. `impacted-tests --parallel` sur le lot :
  379 classes, 3 319 tests, OK.
- Lecteurs du front vérifiés par un sous-agent, en lecture seule (31 méthodes, ~60 couples
  route-ressource-clé) : les clés qui manquaient viennent surtout des mutations, dont le front ne lit
  que des colonnes (`id`, `status`…) ; les pages de détail chargent leurs relations, et les lisent
  sous garde. Aucune lecture qui casserait.
- La garde ne voit pas un `->toArray($request)` sur une variable qui tient une ressource unique :
  aucun cas aujourd'hui.
