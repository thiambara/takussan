---
id: TCK-2120
title: "Les consoles super-admin des comptes, des agences, des biens et des portefeuilles ignorent une valeur en liste au lieu de rendre 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-216--paramètres-lus-à-la-main-en-chaîne-hors-de-buildquery-reçus-en-liste"
tags: [api, admin, validation, pistes]
---

## Contexte

Réf : **P216.01** du fichier de pistes, `retenu · autonome` (A1). `UserDetailController::index`,
`AgencyModerationController::index` et `PropertyModerationController::index` lisent leurs filtres
par `$request->string('filter.x')`, qui caste `(string)` ; les deux premiers castent aussi `sort`,
et `AdminCreditWalletController::index` caste `search`. Une valeur en liste
(`filter[status][]=x`, `sort[]=x`, `search[]=x`) rend 500 « Array to string conversion ».
TCK-1407 et TCK-1866 ont fixé la réponse d'une valeur en liste : celle d'une valeur absente.

## Objectif utilisateur

Un appel mal formé à ces quatre consoles est servi comme si le paramètre manquait, au lieu
d'accuser le serveur.

## Contrat de données

Aucun changement pour une valeur en chaîne (ni pour une valeur vide). Une valeur en liste vaut une
valeur absente : pas de filtre, et le tri par défaut (`-created_at`).

## Delta à produire

- [x] `UserDetailController` et `AgencyModerationController` : un `chaine()` privé qui rend le
  défaut pour une liste, et `trim((string) …)` sinon (la lecture d'avant), pour chaque filtre et
  le tri.
- [x] `PropertyModerationController::index` (`filter[search]`) et
  `AdminCreditWalletController::index` (`search`) : `is_string()` avant le `trim()`.
- [x] Test : `tests/Feature/Admin/ValeursEnListeConsolesAdminTest.php` (un cas par console,
  chaque paramètre en liste → 200).

## Critères d'acceptation

- [x] AC1 — `admin/users` : `filter[search|status|role|agency_id][]` et `sort[]` → 200.
- [x] AC2 — `admin/agencies` : `filter[status|search|is_verified|created_from|created_to][]` et
  `sort[]` → 200.
- [x] AC3 — `properties/moderation?filter[search][]=x` et `admin/credit-wallets?search[]=x` → 200.

## Hors périmètre

- `filter[created_to]` n'était pas cité au constat (relevé par la mesure) : même cause, même
  correctif.
- Une convention de lecture commune à tous les contrôleurs : P216.05, à valider (V6).

## Notes d'implémentation

- Hypothèse : `chaine()` traite seulement la liste comme absente, et garde `trim((string) …)`
  sinon, pour que `sort=` vide se lise comme avant (`''` → `created_at` ascendant).
- Reproduction : les quatre tests neufs rouges avant correctif, « Array to string conversion ».
- Ablation : les quatre contrôleurs remis à l'état de `pre-dev` → 4 rouges ; correctif remis →
  4 verts. `FiltresMalFormesDeLaConsoleTest` 3, `AdminConsoleSearchCaseTest` 2,
  `FiltreDAgenceDeLaConsoleTest` 1, `PropertyModerationTest` 9, `AdminCreditsApiTest` 7,
  `PersonNameCollatedSortTest` 9 et `TriDepartageParIdTest` 3 verts.
