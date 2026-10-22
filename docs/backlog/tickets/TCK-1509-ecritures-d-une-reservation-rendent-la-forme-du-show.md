---
id: TCK-1509
title: "Les écritures d'une réservation rendent la forme de son show (ADR-0071)"
status: done
phase: P2
family: api
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-actions-de-neuf-contrôleurs-rendent-la-ressource-sans-les-relations-et-les-clés-que-le-show-ajoute"
tags: [api, bookings, resources, contract, pistes]
---

## Contexte

Réf : **P95.03** du fichier de pistes, `validé`. Premier modèle de l'ordre d'application
d'[ADR-0071](../../adr/0071-une-ecriture-rend-la-projection-de-son-show.md).

`BookingController::show` charge `property.address`, `customer`, `payments` et ajoute
`can_refund`. `confirm`, `cancel` et `reject` rendaient la ressource nue ; `store` chargeait le
bien sans adresse, et `agency`, que la ressource ne rend pas. Le front type ces réponses
`ApiResponse<Booking>`, comme le `show`.

## Décision du porteur

validé — porteur (2026-10-22) : appliquer ADR-0071 : un seul chemin de présentation pour le `show` et les écritures, exception écrite dans le docblock de la ressource, test de contrat de forme par modèle ; la réservation d'abord, puis la facture

## Objectif utilisateur

La réponse d'un geste sur une réservation a la forme que le front attend : il peut l'écrire dans
le cache du détail sans relire.

## Contrat de données

`POST /api/bookings`, `POST /api/bookings/{id}/confirm|cancel|reject` rendent la forme de
`GET /api/bookings/{id}` : `property` (avec son adresse, en `location`), `customer`,
`refund_status`, `booking_payments`, `can_refund`.

## Contraintes strictes (métier)

- Condition d'ADR-0071 (« qui peut écrire peut lire ») vérifiée sur `BookingPolicy` : `store` par
  le créateur, `validate` (confirmer, refuser) par le bailleur ou le personnel, `cancel` par le
  client, le bailleur ou le personnel ; tous sont lecteurs par `view`. Aucune exception à écrire.

## Delta à produire

- [x] `BookingController::presenter()`, privé, appelé par `show`, `store`, `confirm`, `cancel`,
  `reject` (un seul contrôleur rend le modèle : motif de TCK-1205).
- [x] Assertion partagée `Tests\Support\FormeDuShow` (ADR-0071, « Application »), et son test
  unitaire.
- [x] `BookingWriteMatchesShowTest` : chaque écriture, puis le `show` du même appelant.

## Critères d'acceptation

- [x] AC1 — les quatre écritures ont la forme du `show`, types JSON compris.
- [x] AC2 — l'assertion échoue sur un écart non admis et sur un écart admis qui ne diverge plus.

## Hors périmètre

- La facture : TCK-1511.
- Le passage de `ConversationWriteMatchesShowTest` et `PayoutWriteResponseTest` à l'assertion
  partagée, et les autres modèles de l'ordre d'application (au porteur).

## Notes d'implémentation

- Avant correctif, les quatre tests rouges : `booking_payments`, `can_refund`, `refund_status`
  et `property.location.*` (le bien sans adresse) manquaient ou étaient nuls.
- Piège : retirer un chargement du chemin partagé l'enlève aussi au `show`, et les deux formes
  restent égales. L'ablation ne rougit que parce que le test exige d'abord ce que le `show` rend
  (point 4 d'ADR-0071) : adresse, client, `refund_status`, `booking_payments` non vide.
- Ablation : `payments` retiré du `presenter()` → 3 tests rouges (« le show doit rendre
  l'acompte ») ; remis → 4/4.
