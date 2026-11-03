---
id: TCK-1294
title: "Les lignes d'un relevé bancaire se trient par date comptable : l'écran ne reçoit plus un 400"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-118--listes-paginées-triées-sur-une-colonne-non-unique"
tags: [back, accounting, reconciliation, pistes]
---

## Contexte

Réf : **P118.01** du fichier de pistes, `retenu · autonome` (A1). L'écran
`/app/agency/finances/reconciliation/[statementId]` lit les lignes par `useBankStatementLines`,
qui envoie `sort=posted_at` ; `BankStatementLine` ne déclarait aucun `$requestSortable`, et spatie
refusait la requête en 400.

## Objectif utilisateur

L'admin d'agence voit les lignes de son relevé, rangées par date comptable.

## Contrat de données

`GET /api/bank-statements/{statement}/lines` accepte `sort=id|posted_at|amount` (et leur forme
`-…`). Sans `sort=`, l'ordre est `posted_at` puis `id`.

## Contraintes strictes (métier)

Aucun changement d'autorisation ni de forme de réponse.

## Delta à produire

- [x] `BankStatementLine::$requestSortable = ['id', 'posted_at', 'amount']`.
- [x] `BankStatementLineController::index` : `defaultSorts('posted_at', 'id')`.
- [x] Test : `BankStatementLineSortTest` (tri demandé, tri par défaut).

## Critères d'acceptation

- [x] AC1 — `GET …/lines?per_page=50&page=1&sort=posted_at` rend 200, lignes rangées par
  `posted_at` puis `id`.
- [x] AC2 — Sans `sort=`, les lignes sortent dans le même ordre, même après mise à jour d'une ligne.

## Hors périmètre

- Le départage commun des listes de `buildQuery()` (P118.02, P118.03).
- L'ordre par défaut des relevés eux-mêmes (P118.04).
- Le relevé des `sort=` du front face aux listes blanches (angle 150).

## Notes d'implémentation

- Ablation : modèle et contrôleur rendus à `HEAD` → 2 rouges (400 sur `sort=posted_at` ; ordre
  physique sans `sort=`) ; correctif remis → 2/2 verts.
