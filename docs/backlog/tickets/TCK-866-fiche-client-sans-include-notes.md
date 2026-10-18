---
id: TCK-866
title: "Fiche client : les notes ne sont plus chargées deux fois"
status: done
phase: P2
family: front
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-2--performances-des-requêtes"
tags: [front, performance, crm, pistes]
---

## Contexte

Réf : **P02.09** du fichier de pistes, `retenu · autonome` (A2). `fetchDashboardCustomer` demande
`include=notes,documents,tags` : l'API sérialise toutes les notes du client dans `data.notes`, puis
la page `/app/customers/{id}` et le panneau `CustomerDetailSheet` les redemandent paginées par
`fetchCustomerNotes`. Rien ne lit `customer.notes` (absent du type `CustomerDetail`).

## Objectif utilisateur

L'agent ouvre une fiche client sans que toutes ses notes soient lues et transmises pour rien.

## Contrat de données

`GET /api/customers/{id}` est appelé avec `include=documents,tags`. Les notes restent lues par
`GET /api/customers/{id}/notes`, inchangé.

## Delta à produire

- [x] `src/lib/queries/customers.ts` : `notes` retiré de l'`include` de `fetchDashboardCustomer`.
- [x] Test : `fiche-client-sans-notes.tck-866.test.ts`.

## Critères d'acceptation

- [x] AC1 — `fetchDashboardCustomer` appelle `/api/customers/{id}` avec `include` = `documents,tags`.
- [x] AC2 — Les tests existants de la fiche et du panneau du pipeline restent verts.

## Hypothèses

- Aucun lecteur de `customer.notes` : relevé par `grep` dans `takussan-web/src` (aucun accès à
  `.notes` sur un client, type `CustomerDetail` sans ce champ).

## Hors périmètre

- La ressource `CustomerResource` côté API, qui rend déjà `notes` seulement si la colonne est lue
  ou la relation chargée (TCK-705).

## Notes d'implémentation

- Reproduit avant correctif : `include` = `documents,notes,tags`.
- Ablation : `customers.ts` remis à l'état d'avant → rouge ; remis → vert.
