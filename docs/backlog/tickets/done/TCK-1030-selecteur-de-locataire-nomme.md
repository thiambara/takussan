---
id: TCK-1030
title: "Le sélecteur de locataire du nouveau bail porte un nom accessible"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, leases, pistes]
---

## Contexte

Réf : **P68.02** du fichier de pistes, `retenu · autonome` (A4). Dans `CreateLeaseForm`, le
libellé « Locataire » vise le champ de recherche (`#tenant-search`), et `EntitySelect` reçoit
`label={null}` : le déclencheur `#field-tenant_id` n'a aucun nom accessible (axe : `button-name`,
« critical », sur `/app/leases/new`).

## Objectif

Le déclencheur du choix du locataire s'annonce « Locataire ».

## Delta à produire

- [x] `EntitySelect` (dans `CreateLeaseForm.tsx`) accepte un nom accessible pour le cas sans
      libellé visible, posé en `aria-label` sur le `SelectTrigger`.
- [x] Le choix du locataire le reçoit, avec la clé existante `leases.…tenant` (`t('tenant')`).
- [x] Test : `getByRole('combobox', { name: /Locataire/ })` trouve `#field-tenant_id`.

## Critères d'acceptation

- [x] AC1 — Le combobox du locataire a pour nom accessible « Locataire ».
- [x] AC2 — Ablation : sans l'`aria-label`, le test rougit.

## Hypothèses (mode sans humain)

- `aria-label` avec la clé existante plutôt qu'`aria-labelledby` vers le libellé : le libellé
  vise déjà le champ de recherche, et ne contient pas que le mot (astérisque). Aucun texte neuf.

## Hors périmètre

- Revoir la composition recherche + liste du choix du locataire.

## Notes d'implémentation

- Avant correctif, `getByRole('combobox', { name: /^Locataire/ })` ne trouve rien.
- Ablation : `aria-label` retiré du `SelectTrigger` → 1 rouge ; remis → 1 vert. Le reste de
  `src/components/leases` reste vert.
