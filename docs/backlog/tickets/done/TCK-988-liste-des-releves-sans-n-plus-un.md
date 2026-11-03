---
id: TCK-988
title: "La liste des relevés bancaires précharge les comptes de reconciled_ratio"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#40-bankstatement-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-58--colonnes-absentes-du-sparse-fieldset--relation-valeur-par-défaut-ou-null-à-la-place"
tags: [api, accounting, performance, n-plus-un, pistes]
---

## Contexte

Réf : **P58.03** du fichier de pistes, `retenu · autonome` (A2). `reconciled_ratio` est un
accesseur de `BankStatement` qui compte les lignes du relevé par `match_status` à chaque lecture ;
`BankStatementResource` le lit pour chaque élément, et `BankStatementController::index` ne
précharge rien. Re-mesuré le 2026-10-19 sur `pre-dev` 99abff99b par le test ci-dessous : 2 relevés
→ 2 requêtes `bank_statement_lines`, 12 relevés → 12. Le front demande la liste par 50.

## Objectif

Afficher la liste des relevés coûte un nombre de requêtes fixe, quel que soit le nombre de relevés,
pour le même ratio rendu.

## Delta à produire

- [x] `BankStatement::scopeWithReconciledCounts()` : `withCount` du total, des `confirmed` et des
      `ignored`, sous des alias explicites (`lines_count` est une colonne).
- [x] `getReconciledRatioAttribute()` : lit les alias quand ils sont chargés, interroge sinon.
- [x] `BankStatementController::index` : `->withReconciledCounts()` après `buildQuery()`.
- [x] Tests: `tests/Feature/Api/Accounting/BankStatementListQueryBudgetTest.php` (budget 2 = 12,
      ratio identique, budget sous `fields[bank_statements]`).

## Critères d'acceptation

- [x] AC1 — Le nombre de requêtes citant `bank_statement_lines` est le même pour 2 et 12 relevés.
- [x] AC2 — Le ratio rendu par la liste est celui de l'accesseur (`{2, 1, 2, 5}` sur la fixture).
- [x] AC3 — Sous `fields[bank_statements]=id,status`, une seule requête cite les lignes et le ratio
      reste juste.

## Hypothèses (mode sans humain)

- `show` et le listener `NotifyStatementFinalized` lisent un seul relevé : ils gardent la requête
  de l'accesseur.

## Hors périmètre

- Les autres listes à accesseur compté (non relevées).

## Notes d'implémentation

- Avant : 12 requêtes au lieu de 2 (AC1), 2 au lieu de 1 (AC3).
- Ablation : correctif retiré → AC1 et AC3 rouges ; remis → verts. Variante : `withReconciledCounts()`
  posé sur la requête de base, AVANT `buildQuery()` → AC3 rouge (`2` au lieu de `1`) : le `select`
  des `fields[]` de spatie (`AddsFieldsToQuery.php:52`) écrase les sous-requêtes de compte.
