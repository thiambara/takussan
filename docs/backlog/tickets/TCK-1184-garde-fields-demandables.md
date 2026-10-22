---
id: TCK-1184
title: "Une garde juge chaque fields[…] du front contre le $queryFields de sa table"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-100--fields-du-front-face-aux-queryfields-et-ce-que-lécran-lit-hors-de-sa-demande"
tags: [front, garde, sparse-fieldsets, pistes]
---

## Contexte

Réf : **P100.04** du fichier de pistes, `retenu · autonome` (A5). C'est le reste de P68.01
(TCK-1029) : seule `AGENCY_UPGRADE_REQUEST_FIELDS` était gardée contre le `$queryFields` de son
modèle, et un `fields` refusé rend 400 `InvalidFieldQuery`.

**Hypothèse retenue** (classement du mesureur) : un test vitest qui lit le `$queryFields` des
modèles dans le PHP, comme celui de TCK-1029, sans commande d'export ni changement de CI, et qui
porte la liste motivée des endpoints hors `buildQuery`.

## Objectif utilisateur

Aucune colonne demandée par le front ne fait rendre 400 à l'API sans qu'un test rougisse.

## Delta à produire

- [x] `src/lib/queries/__tests__/fields-demandables.tck-1184.test.ts`.

## Critères d'acceptation

- [x] AC1 — chaque `fields[<table>]` du front (objets `fields: {…}` avec constantes et `...`
      résolues, `qs.set('fields[…]', '…')`, `fields[…]=…` en dur) ne nomme que des colonnes d'un
      `$queryFields` de cette table, hors exceptions motivées.
- [x] AC2 — plancher de vacuité : 45 tables, 80 demandes, 78 aux colonnes résolues (mesuré : 50,
      86, 84).
- [x] AC3 — une exception qui n'a plus d'envoi, ou dont la table a gagné un `$queryFields`, rougit.

## Hors périmètre

- Relier chaque site à sa route : la table jugée contre le modèle de sa table suffit, avec les
  exceptions nommées (cinq modèles au `$queryFields` vide, trois tables sans modèle, trois sites
  de listes écrites à la main).
- Les colonnes passées en paramètre de fonction (`inventory.ts`, `maintenance.ts`), non suivies.

## Notes d'implémentation

- Les commentaires sont retirés avant lecture : `conversations-list.ts` et `properties-server.ts`
  citent `main_photo_url` en commentaire, précisément parce qu'il est refusé.
- Une constante se résout d'abord dans son fichier : plusieurs modules déclarent `LIST_FIELDS`.
- Ablation : `'ninea'` remis dans `AGENCY_UPGRADE_REQUEST_FIELDS` (le défaut de TCK-1029) → rouge
  (« fields[agency_upgrade_requests] refusées → ninea »).
