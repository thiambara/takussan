---
id: TCK-2285
title: "Le locataire, le garant et le client d'un bail ou d'une réservation sont des fiches de l'agence du bien"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#27-guarantor-"
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-226--identifiants-de-ligne-cible-reçus-du-client-sur-les-routes-décriture"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md"
tags: [api, baux, réservations, garants, autorisation, pistes]
---

## Objectif

Un bail ou une réservation d'un bien d'agence ne prend pour locataire, garant ou client qu'une fiche
de l'agence du bien, en plus de `can('view')`.

## Contexte

Réf : **P226.01** du fichier de pistes, `validé`.

`CustomerPolicy::view` et `GuarantorPolicy::view` ne lisent que l'agence de la fiche. Un compte agent
de A et de B, sous l'indice `agent:B`, rattachait la fiche de A qu'il avait ajoutée à un bail
(`POST /api/leases`), à une réservation (`POST /api/bookings`) ou à un bail par
`POST /api/leases/{id}/guarantors`, sur un bien de B. Le personnel de B lisait ensuite cette fiche
par le bail (`GET /api/leases/{id}?include=tenant`), alors que `GET /api/customers/{id}` lui rend 403.

## Décision du porteur

validé — validation du porteur (2026-10-25) : la fiche (locataire, garant, client) doit être de l'agence du bien quand le bien a une agence, en plus de `can('view')` ; un bien sans agence ne change pas

## Delta à produire

- [x] `App\Services\Property\ContactDeLAgenceDuBien` : `client()` compare `customers.agency_id`,
  `garant()` l'agence que lit `GuarantorPolicy::agencyOf()`. Un bien sans agence admet tout.
- [x] `LeaseService::create` : locataire et garant.
- [x] `BookingService::create` : client nommé par `customer_id`, hors réservation pour soi.
- [x] `LeaseController::attachGuarantor` : garant existant, contre l'agence du **bien** du bail.
- [x] ADR-0031, amendement du 2026-10-25, et sa ligne de `docs/adr/README.md`.
- [x] `ContactDeLAgenceDuBienTest`.

## Critères d'acceptation

- [x] AC1 — agent de A et de B, indice `agent:B`, bien de B : le bail au locataire de A, le bail au
  garant de A, la réservation au client de A et le rattachement du garant de A rendent 403, et
  aucune ligne n'est créée.
- [x] AC2 — témoin : les mêmes gestes avec les fiches de B rendent 201.
- [x] AC3 — témoin : sur un bien sans agence, le bailleur rattache toujours les fiches de A qu'il lit.
- [x] AC4 — témoin : la fiche sans agence d'un client du tunnel (`findOrCreateFromUser`) n'est pas
  davantage refusée. Le client réserve toujours pour lui, qu'il la nomme ou non, et le personnel de
  B reçoit 403 comme avant : il ne la lisait pas.

## Hypothèses

- La réservation **pour soi** (`customer_id` = la fiche du demandeur) ne passe pas par
  `can('view')`. La décision ajoute la règle « en plus de `can('view')` » : la branche pour soi reste
  inchangée, comme le tunnel public qui résout la même fiche sans `customer_id`.
- Le super-admin est soumis à la règle comme tout appelant : la décision dit que la fiche « doit
  être » de l'agence du bien, et la fuite vers le personnel de B est la même.
- `attachGuarantor` juge contre l'agence du **bien** et non contre `leases.agency_id` : sur un bien
  sans agence, `LeaseService::create` pose l'agence du bailleur, et la décision veut ce bien inchangé.
- Le refus reste un 403 sans code, celui de l'absent et du tiers (P62).

## Notes d'implémentation

- Avant correctif : 4 rouges (201 au lieu de 403), les 3 témoins déjà verts. AC4 est donc mesuré sur
  l'arbre d'avant : la fiche du tunnel était déjà refusée au personnel de B.
- Ablation, site par site (la clause remplacée par `true`) : locataire, garant du bail, client de la
  réservation, `attachGuarantor` rougissent chacun leur test, et lui seul ; remis : 7 verts.
- `GuarantorPolicy::agencyOf()` et non la colonne seule : un garant ancien, sans `agency_id`, prend
  l'agence de son auteur, comme dans sa policy (`OwnerIsolationWithinAgencyTest` en dépend).
