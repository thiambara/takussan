---
id: TCK-1109
title: "Prénom, nom et profession d'une fiche client bornés à leur colonne : 422 et non 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, crm, validation, pistes]
---

## Contexte

Réf : **P91.04** du fichier de pistes, `retenu · autonome` (A1 : la colonne et la borne voisine de
`emergency_contact_name` fixent le contrat, seul le 500 devient 422).

`customers.first_name`, `last_name` et `occupation` sont des `varchar(255)`. `StoreCustomerRequest`
et `UpdateCustomerRequest` les validaient sans `max` : une valeur trop longue atteignait PostgreSQL
(22001), soit 500.

## Objectif utilisateur

L'agent, ou un client direct de l'API, qui saisit un prénom, un nom ou une profession trop longs
reçoit une erreur de validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] `StoreCustomerRequest` et `UpdateCustomerRequest` : `max:255` sur `first_name`, `last_name` et
      `occupation`.
- [x] Test `tests/Feature/Api/CustomerFieldLengthTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/customers` en agent, avec l'une des trois clés à 256 caractères : 422 sur la
      clé, aucune fiche créée ; à 255 : 201.
- [x] AC2 — `PUT /api/customers/{id}` : mêmes cas, 422, fiche inchangée ; à 255 : 200.

## Hors périmètre

- La borne de l'adresse e-mail (P91.05).

## Notes d'implémentation

- Ablation : les deux FormRequest rendues à `HEAD` → 2 rouges sur 2 ; correctif remis → 2/2.
