---
id: TCK-1405
title: "Une date illisible dans un filtre de date rend 422, plus 500"
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
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, filtres, pistes]
---

## Objectif utilisateur

Un lien abîmé (`?created_from=abc`) rend une erreur de saisie lisible, plus une erreur du serveur.

## Contexte

Réf : **P151.04** du fichier de pistes, `retenu · autonome` (A1 : la règle `date` des requêtes
d'export, reprise par `DateBoundaryFilter` avec #1071).

Mesuré avant correctif (garde ci-dessous, rouge sur `e72d2ad69`) : `filter[created_from]=abc` et
`filter[created_to]=abc` sur `/api/properties`, `filter[date_from]=abc` et `filter[date_to]=abc`
sur `/api/payments/history`, `filter[created_from]=abc` sur `/api/admin/agencies` → 500.
`/api/activity-log` et `/api/audit-log` rendent déjà 422 (`DateBoundaryFilter`, #1071) : gardés
comme témoins.

## Hypothèses (mode sans humain)

- La réponse est le 422 de la règle `['string', 'date']`, déjà celle de `DateBoundaryFilter` :
  extraite en `DateBoundaryFilter::exiger()`, appelée par les trois lectures à la main. Aucun code
  neuf. Les bornes elles-mêmes ne changent pas (`DayRange`, `whereDate`).
- `AgencyUpgradeRequestController` (« déduit, à vérifier » au constat, masqué par P150.02),
  `CrossTenantAuditController` et `UserDetailController` ne sont pas touchés.

## Delta à produire

- [x] `DateBoundaryFilter::exiger()` ; `__invoke()` l'appelle.
- [x] `Property` (`created_from`, `created_to`), `PaymentController::history` (`date_from`,
  `date_to`), `AgencyModerationController` (`created_from`, `created_to`) l'appellent.
- [x] Test : `tests/Feature/Api/DateIllisibleDansUnFiltreTest.php`.

## Critères d'acceptation

- [x] AC1 — Chaque route citée rend 422 sur `abc`, et 200 sur `2026-10-22`.

## Notes d'implémentation

- Ablation : les quatre fichiers de `app/` rendus à leur état antérieur → 5 rouges (500) ;
  remis → 7 verts.
- La règle `string` refuse aussi une liste (`filter[created_to][]=…`), ce que P151.06 relève.
