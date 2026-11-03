---
id: TCK-807
title: "Un `include=` accepté sur les baux, reversements et réservations est un `include=` émis"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: [TCK-695]
blocks: []
spec_refs:
  features: []
  models:
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#28-payout-
    - docs/models-spec.md#5-booking
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include
tags: [back, api, query-builder, ressources, pistes]
---

## Contexte

Réf : **P21.05** du fichier de pistes, `validé` (critère du dernier classement accordé : V7).
`Lease`, `Payout` et `Booking` déclarent dans `$requestLoadable` des relations que leur ressource
n'émet pas : `include=landlord` sur `/api/leases` rendait 200, chargeait la relation, et la réponse
n'en disait rien. P21.04 (TCK-695) en était le cas réel, et a retiré `include=guarantor` du front.

**Décision du porteur** (recopiée mot pour mot) :

> retirer de $requestLoadable ce qu'aucune ressource n'émet, guarantor compris une fois P21.04 faite ; une garde neuve confronte $requestLoadable aux whenLoaded

**Hypothèse notée (mode sans humain)** : le retrait porte sur les trois modèles mesurés par la
piste. La garde balaie tous les modèles ; les écarts qu'elle relève ailleurs sont exemptés, comptés
un par un, et laissés au reste de l'entrée : chacun demande de vérifier ses appelants ou de décider
d'émettre la relation (V3).

## Objectif

Une liste refuse en 400 un `include=` que sa ressource n'émet pas, au lieu de le charger pour rien.

## Delta à produire

- [x] `Lease::$requestLoadable` : `property`, `tenant`, `renewedFrom`, `renewals`.
- [x] `Payout::$requestLoadable` : `issuer`.
- [x] `Booking::$requestLoadable` : `property`, `customer`.
- [x] `PayoutController` (`index`, `show`) ne charge plus `landlord`, qu'il n'émettait pas.
- [x] Garde : `tests/Unit/Http/Resources/RequestLoadableEmittedTest.php`.
- [x] Test : `tests/Feature/Api/IncludeNonEmisRefuseTest.php`.

## Critères d'acceptation

- [x] AC1 — `include=` sur une des douze relations retirées → 400 (`landlord`, `agency`, `agent`,
  `guarantor`, `onboardingChecklist` pour les baux ; `lease`, `booking`, `agency`, `landlord`,
  `approver`, `processor` pour les reversements ; `agency` pour les réservations).
- [x] AC2 — les `include=` émis (`property`, `tenant`, `issuer`, `customer`) restent permis et rendus.
- [x] AC3 — un modèle qui a une ressource et déclare une relation qu'elle n'émet ni par
  `whenLoaded` ni par `relationLoaded` fait rougir la garde, sauf exemption ; une exemption devenue
  inutile la fait rougir aussi.

## Hors périmètre

- **Reste à faire** : les écarts exemptés de la garde (`Agency`, `AgencyUpgradeRequest`, `Customer`,
  `Document`, `Inventory`, `Invitation`, `Invoice`, `KycDossier`, `MaintenanceRequest`,
  `OwnerProfile`, `PrivacyRequest`, `Property`, `ServiceProviderBill`, `User`), à retirer ou à
  émettre un par un.
- `BookingController` charge encore `agency` dans `index`, `show` et `store` sans l'émettre (relevé,
  non cité par la piste).
- `Lease::guarantor` et `leases.guarantor_id` (TCK-695, V4).

## Notes d'implémentation

- Ablation : `app/` revenu à `pre-dev`, 13 rouges sur 15 (les 12 includes rendent 200, la garde nomme
  `Booking`, `Lease`, `Payout`) ; correctif remis, 15 verts.
- La garde lit le source de la ressource : `Property::tags`, émis par `when($isDetail)`, n'y est pas
  reconnu et figure donc parmi les exemptions, avec sa raison.
- Retirer une relation de `$requestLoadable` retire aussi ses `fields[<table>]` imbriqués
  (`HasQueryBuilder::getAllAllowedQueryFields`) ; aucun appelant du front ne les envoie (lu :
  `src/lib/queries/leases.ts`, `bookings.ts`).
