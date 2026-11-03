---
id: TCK-1470
title: "L'avis « relevé de gérance disponible » écrit le mois, plus `2026-09`"
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
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, front, notifications, i18n, pistes]
---

## Contexte

Réf : **P164.02** du fichier de pistes, `retenu · autonome` (A4).

`SendOwnerStatements` range `period` en `Y-m` dans un paramètre `text` d'`owner_statement.available` :
titre fr « Relevé de gérance 2026-09 disponible », en « Your 2026-09 management statement… », et la
cloche l'affiche brut (ni `DATE_SEULE` ni `DATE_HEURE`).

## Contrat de données

- Nature de paramètre neuve `NotificationCode::PARAM_MONTH` (`month`), portée par
  `owner_statement.available` ; la valeur rangée reste `Y-m`.
- API : `isoFormat('MMMM YYYY')` dans la langue du destinataire ; une valeur d'une autre forme est
  rendue telle quelle (tronquée comme un texte dans un SMS), « — » si absente.
- Cloche : pour les paramètres listés dans `PARAMS_MOIS` (ce seul code), `fmt.date` en
  `{ month: 'long', year: 'numeric' }` sur le premier du mois ; autre forme → telle quelle.
- Hypothèse : aucun texte neuf, les gabarits existants gardent `:period` / `{period}`.

## Delta à produire

- [x] `NotificationCode::PARAM_MONTH`, déclaré pour `OwnerStatementAvailable`.
- [x] `NotificationRenderer::month()`.
- [x] `texteNotification.ts` : `PARAMS_MOIS` et sa branche.
- [x] Tests : `ReleveDeGeranceMoisTest` (API), `NotificationRow.test.tsx` (cloche).

## Critères d'acceptation

- [x] AC1 — fr et en, titre, corps et SMS pour `2026-09` : « septembre 2026 » / « September 2026 », sans `2026-09`.
- [x] AC2 — une période illisible reste telle quelle, une absente rend « — ».
- [x] AC3 — la cloche rend « Relevé de gérance septembre 2026 disponible » et l'équivalent anglais.

## Hors périmètre

- La nature des paramètres transmise au front (P164.05, à valider) : la cloche liste ici le code à la main.

## Notes d'implémentation

- Ablation API : `NotificationCode.php` et `NotificationRenderer.php` remis à l'état d'avant → 2 rouges, remis → vert.
- Ablation front : `texteNotification.ts` remis à l'état d'avant → 2 rouges, remis → vert.
- `createFromFormat('!Y-m', …)` : sans `!`, Carbon prend le jour courant et un 31 déborde sur le mois suivant.
