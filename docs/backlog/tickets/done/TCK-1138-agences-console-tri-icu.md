---
id: TCK-1138
title: "Agences de la console et portefeuilles de crédits : nom trié en ordre ICU, départage par id"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-87--tris-alphabétiques-sous-la-collation-c"
tags: [back, admin, agency, credits, collation, adr-0025, pistes]
---

## Contexte

Réf : **P87.05** du fichier de pistes, `validé (délégué)` (V7 accordé : choix mineur et réversible
pour deux listes de la console que l'on touche déjà, sans donnée ni index).

La liste des agences du super-admin (`Admin\AgencyModerationController::index`, `sort=name`) et
celle des portefeuilles de crédits (`Admin\AdminCreditWalletController::index`) triaient `name`
par un `orderBy()` nu, sans départage : sous `--locale=C`, « École … » passait après « Zeta », et deux
agences de même nom n'avaient pas d'ordre garanti.

## Décision du porteur (déléguée)

ajouter `id` en départage aux tris écrits à la main de `AgencyModerationController` (liste des agences du super-admin) et `AdminCreditWalletController`, et y trier `name` en `COLLATE "und-x-icu"` ; test : deux agences « Zeta » et « École … » → « École » avant « Zeta », et deux agences de même nom rendues dans l'ordre de leur `id` ; reste : le tri ICU des titres de biens (`Property::$requestSortable` `title`, `ConversationContextController`), au porteur

## Reste à faire

le tri ICU des titres de biens (`Property::$requestSortable` `title`, `ConversationContextController`), au porteur

## Objectif utilisateur

Le super-admin retrouve les agences dans l'ordre alphabétique attendu, et une pagination stable
entre deux agences homonymes.

## Delta à produire

- [x] `AgencyModerationController::index()` : `sort=name` par `CollatedNameSort` sur
      `agencies.name` ; `agencies.id` en départage de tout tri.
- [x] `AdminCreditWalletController::index()` : `CollatedNameSort` sur `agencies.name`, puis
      `agencies.id`.
- [x] Test `tests/Feature/Api/Admin/AgencyNameCollatedSortTest.php`.

## Critères d'acceptation

- [x] AC1 — agences « Zeta », « Teranga » ×3, « École Immo » → `/api/admin/agencies?sort=name` rend
      « École Immo », les trois « Teranga » dans l'ordre de leur `id`, « Zeta ».
- [x] AC2 — `sort=-name` rend l'ordre inverse des noms, les homonymes toujours dans l'ordre de leur `id`.
- [x] AC3 — `/api/admin/credit-wallets` rend le même ordre qu'AC1.

## Hors périmètre

- Le reste ci-dessus, gardé par le porteur.
- Aucun changement du front : il demande déjà `sort=name`.

## Notes d'implémentation

- Ablation : les deux contrôleurs rendus à `HEAD` → 3 rouges sur 3 ; remis → 3/3.
- Le départage par `id` reste montant en tri descendant : la décision fixe « l'ordre de leur `id` ».
