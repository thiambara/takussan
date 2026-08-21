---
id: TCK-336
title: "Sparse fieldsets — `fields[table]` n'est honoré par AUCUNE ressource"
status: todo
phase: P2
family: technique
estimate: L
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#3-property
tags: [back, front, api, conventions, dette]
---

## Objectif utilisateur

Une vue qui demande cinq colonnes reçoit cinq colonnes, et non quarante-sept — la règle non
négociable du dépôt (« sparse fieldsets obligatoires ») cesse d'être une intention.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md) après contre-mesure. Détail et
chiffres : [`docs/qa/audit-recherche-navigation-2026-08-21.md`](../../qa/audit-recherche-navigation-2026-08-21.md),
§6 et sa section « Corrections ».

**Le diagnostic de l'audit était faux, et c'est ce qui a fait sortir le sujet.** Il attribuait le
défaut au fait que `PropertySearchService` construit la ressource hors `HasQueryBuilder`. Mesuré
le 2026-08-21 : `/public/properties/{slug}`, qui n'emprunte pas ce service, ignore `fields[]` tout
autant (47 clés dans les deux cas), et une sonde tinker montre que **même avec `HasQueryBuilder`
pleinement en jeu** — `attributes = id,title` sur le modèle — la ressource émet 47 clés. Spatie ne
restreint que le `SELECT` SQL ; il n'a aucune prise sur `toArray()`.

**Le mécanisme manquant est au niveau RESSOURCE, sur les 44 ressources du dépôt** :
`grep array_intersect_key app/Http/Resources/` → vide.

## Contraintes strictes (métier)

- **Cinq appelants front comptent aujourd'hui sur la SUR-LIVRAISON**, et c'est le risque principal.
  `DASHBOARD_PROPERTY_FIELDS` (`lib/queries/properties-server.ts:24-46`) et
  `ADMIN_PROPERTY_FIELDS` (`lib/queries/super-admin.ts:413`) **ne demandent pas `main_photo_url`**
  et l'affichent — un filtre au niveau ressource ferait disparaître les vignettes du tableau de
  bord agent et de la console super-admin, **sans erreur TypeScript ni test rouge** (c'est du JSON
  à l'exécution). Leurs listes doivent être étendues dans le même lot.
- `properties-server.ts:24-26` documente pourquoi : `main_photo_url` est un attribut **calculé**,
  et le demander via `fields[properties]` fait rendre 400 `InvalidFieldQuery` à spatie. Le filtrage
  au niveau ressource et la validation spatie ne portent donc pas sur le même ensemble.
- `whenHas()` reste la convention pour les attributs **potentiellement absents** (précédent
  documenté : `UserResource.php:29-49`), et n'est **pas** le mécanisme de filtrage.

## Delta à produire

- [ ] `BaseResource::restreintAuxChampsDemandes(array $data, string $table)` s'appuyant sur
      `Spatie\QueryBuilder\QueryBuilderRequest::fromRequest($request)->fields()` — vérifié sur
      spatie 7.3.0 : fonctionne **sans** QueryBuilder, rend `['properties' => ['id','title']]`
- [ ] Le filtre ne s'applique **que si** `fields[<table>]` est présent
- [ ] `SearchPublicPropertyRequest::rules()` doit déclarer `fields` (sinon `validated()` le jette)
      et `PropertySearchService::search(array $params)` doit recevoir la `Request` — deux
      signatures à toucher
- [ ] Étendre `DASHBOARD_PROPERTY_FIELDS` et `ADMIN_PROPERTY_FIELDS` avec ce qu'ils affichent
- [ ] Test de non-régression sur les cinq appelants front

## Critères d'acceptation

- [ ] AC1 — `?fields[properties]=id,title` rend **exactement** les clés demandées, sur `/search`
      comme sur `/{slug}`
- [ ] AC2 — sans `fields[]`, la réponse est inchangée au caractère près
- [ ] AC3 — les vignettes du tableau de bord agent et de la console super-admin s'affichent encore

## Hors périmètre

- Les 43 autres ressources : ce ticket pose le mécanisme et l'applique à `PropertyResource`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
