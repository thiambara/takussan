---
id: TCK-1068
title: "La création d'un bail ne dit plus quels clients, garants, biens et réservations existent"
status: done
phase: P2
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-62--règles-exists-des-routes-ouvertes-à-tout-compte-connecté--oracles-dexistence"
tags: [api, autorisation, oracle, pistes]
---

## Contexte

Réf : **P62.01** du fichier de pistes, `validé` (V2). `StoreLeaseRequest::authorize()` rend `true`,
et ses `exists:` (`property_id`, `tenant_id`, `guarantor_id`, `booking_id` restreint au bien) se
jugent avant toute autorisation. Un identifiant absent rend 422 sur son champ, un identifiant tiers
passe la validation : la création dit à tout compte connecté quelles fiches existent, trois par
requête.

## Décision du porteur

> (a) juger l'existence dans le service avec la réponse du refus (modèle de TCK-599), pour les sept entrées P62.01 à P62.07 ; test : même statut et même corps pour un absent et un tiers (porteur, 2026-10-20)

## Objectif

Pour un client, un garant, un bien ou une réservation, un absent et un tiers reçoivent le même
statut et le même corps.

## Delta à produire

- [x] `StoreLeaseRequest` : les quatre `exists:` deviennent `integer`.
- [x] `LeaseController::store()` : un bien absent rend 403, comme le refus de `LeaseService::create()`.
- [x] `LeaseService::create()` : la réservation d'origine doit être une réservation du bien, jugée
      après l'autorisation du bien, avec l'erreur 422 `booking_id` d'avant. Le client et le garant
      absents y rendaient déjà 403, comme un tiers.
- [x] `ExistsSurRouteOuverteTest` : l'exception `StoreLeaseRequest` (P62.01) est retirée.
- [x] Test : `LeaseExistenceOracleTest`.

## Critères d'acceptation

- [x] AC1 : hors agence, face à un bien tiers, un client et un garant absents rendent la même réponse
      que des tiers : 422 sur le seul `type` invalide, puis 403 avec un corps valide.
- [x] AC2 : pour le bailleur, client ou garant absent et client ou garant tiers rendent le même 403.
- [x] AC3 : un bien absent rend le 403 d'un bien tiers.
- [x] AC4 : une réservation absente et celle d'un autre bien rendent la même 422 `booking_id` ; la
      réservation du bien reste acceptée.
- [x] AC5 : un identifiant non entier rend 422, et non 500.

## Hypothèses (mode sans humain)

- **La réservation garde sa 422.** L'appelant a déjà passé l'autorisation du bien quand elle se juge,
  et elle est restreinte au bien : la réponse ne dit rien hors de son périmètre. Le message reste
  celui de `validation.exists`.
- **Le bien absent rend 403 et non 404**, comme `BookingController::store()` depuis TCK-1066 (P62.02).

## Hors périmètre

- P62.03 à P62.07 (les autres routes de l'angle 62).

## Notes d'implémentation

- Avant correctif : 5 rouges sur 6, dont `property_id=abc` → 500 (`exists:` sur PostgreSQL).
  Ablations : FormRequest d'origine → 5 rouges ; `findOrFail` du contrôleur → 1 rouge (bien absent) ;
  service sans le contrôle de la réservation → 1 rouge (la réservation d'un autre bien était acceptée).
