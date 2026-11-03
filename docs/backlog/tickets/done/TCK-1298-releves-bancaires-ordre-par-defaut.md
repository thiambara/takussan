---
id: TCK-1298
title: "Les relevés bancaires d'une agence ont un ordre par défaut : le plus récent d'abord"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1296]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-118--listes-paginées-triées-sur-une-colonne-non-unique"
tags: [back, accounting, reconciliation, pistes]
---

## Contexte

Réf : **P118.04** du fichier de pistes, `retenu · autonome` (A1). `BankStatementController::index`
ne posait ni `defaultSort` ni `orderBy` : sans `sort=`, PostgreSQL rendait l'ordre du plan. Le
volet « lignes » de la piste est livré par TCK-1294 (`defaultSorts('posted_at', 'id')`).

## Objectif utilisateur

L'admin d'agence retrouve ses relevés dans un ordre stable, le plus récent d'abord.

## Contrat de données

`GET /api/agencies/{agency}/bank-statements` sans `sort=` : `created_at` décroissant, puis `id`
décroissant (départage de TCK-1296). `$requestSortable` des relevés prend la forme des autres
modèles : `['id', 'created_at', 'period_start']` ; le sens se demande par `-`, comme avant.

## Contraintes strictes (métier)

Les tris envoyés aujourd'hui (`-created_at`, `created_at`, `±period_start`) restent acceptés.

## Delta à produire

- [x] `BankStatementController::index` : `defaultSort('-created_at')`.
- [x] `BankStatement::$requestSortable` sans les entrées préfixées de `-`, avec `id` en tête.
- [x] Test : `BankStatementDefaultOrderTest`.

## Critères d'acceptation

- [x] AC1 — Sans `sort=`, cinq relevés dont deux de même seconde et deux mis à jour sortent par
  `created_at` puis `id`, décroissants.
- [x] AC2 — `sort=-created_at|created_at|-period_start|period_start|-id` rendent 200.

## Hors périmètre

- Les lignes d'un relevé (TCK-1294).

## Notes d'implémentation

- `id` devient triable sur les relevés, comme sur les autres modèles : sans lui, l'AC2 rend 400
  sur `sort=-id`.
- Ablation : contrôleur et modèle rendus à `HEAD` → 2 rouges (ordre physique ; 400 sur `-id`) ;
  correctif remis → 2/2 verts.
