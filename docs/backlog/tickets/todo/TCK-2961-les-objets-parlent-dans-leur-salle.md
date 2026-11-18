---
id: TCK-2961
title: "Les objets parlent dans leur salle : échéance, relance, paiement, quittance, préavis, renouvellement, état des lieux, devis, créneau, réservation acceptée"
status: todo
phase: P1
family: back
estimate: L
wave: 94
created: 2026-11-17
updated: 2026-11-17
depends_on: [TCK-2958, TCK-2959, TCK-2960, TCK-2955]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
    - docs/features.md#14-location-longue-durée-baux
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#20-message-
    - docs/models-spec.md#14-lease-
    - docs/models-spec.md#15-leasepayment-
    - docs/models-spec.md#24-inventory-
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#17-propertyvisit-
    - docs/models-spec.md#21-maintenancerequest-
tags: [back, messagerie, le-fil, evenements, bail, paiement, intervention, visite, adr-0128]
---

## Objectif utilisateur

- **Toute partie d'un bail, d'une réservation ou d'une intervention** : ce qui arrive à l'objet
  s'écrit dans son fil au moment où ça arrive, et seul celui dont on attend un geste le voit compter
  comme non lu.

## Contrat de données

- ADR-0128 §§ 3 et 5 ; mécanismes livrés par TCK-2958 (`EvenementsDuFil`, `CodesDuFil`, projection),
  TCK-2959 (`action_for`), TCK-2960 (`SallesDuFil`), TCK-2955 (signal du fil à la création d'un
  message : **aucun émetteur neuf ici**, l'écriture de l'événement suffit à rafraîchir le fil chez
  les autres lecteurs).
- Les types d'objets et leurs projections (`lease_payment`, `inventory`, `property_visit`, en plus des
  trois types sujets) sont posés par TCK-2958. Ce ticket n'ajoute que des **codes** au catalogue
  `CodesDuFil`, et les écritures.

### Les événements

`action_for` désigne, **parmi les participants actifs**, ceux que la politique de l'objet autorise au
geste attendu, jugé à l'émission. La colonne « Source » est le point d'accroche relevé le 2026-11-17 :
s'y brancher, ne pas créer d'événement Laravel là où il en existe un.

| Code | Source | Objet | Fil | Geste attendu (`action_for`) | Clés de `data` |
|---|---|---|---|---|---|
| `lease_payment.due_soon` | `SendLeasePaymentReminders`, jalon J-3 | `lease_payment` | salle du bail | payer : le locataire | `due_date` |
| `lease_payment.overdue` | `SendLeasePaymentReminders`, jalons de retard | `lease_payment` | salle du bail | payer : le locataire | `due_date`, `days_late` |
| `lease_payment.reminded` | `LeasePaymentReminderController@store` (relance à la main) | `lease_payment` | salle du bail | payer : le locataire | `due_date` |
| `lease_payment.paid` | `LeasePaymentSettledOnline` (en ligne) **et** `LeasePaymentService::markPaid` (à la main) | `lease_payment` | salle du bail | — | `method` (code du moyen) |
| `lease_payment.receipt_issued` | `SendRentReceiptAfterOnlinePayment` **et** le chemin de quittance de `markPaid` | `lease_payment` | salle du bail | — | — |
| `lease.notice_given` | `LeaseEarlyTerminationRequested` | `lease` | salle du bail | — | `effective_date` |
| `lease.renewed` | `LeaseRenewed` | `lease` (le bail parent, qui passe à `renewed`) | salle du bail parent (le nouveau bail a sa propre salle, ouverte à sa création par TCK-2960) | — | `renewed_lease_id`, `start_date` |
| `inventory.awaiting_signature` | `InventoryService::submit` | `inventory` | salle du bail de l'état des lieux | signer : chaque partie dont la signature manque | `type` (entrée / sortie) |
| `maintenance.quote_submitted` | `MaintenanceStatusChanged` (cause existante, écrit par `SyncMaintenanceConversation`) | `maintenance_request` | fil de l'intervention | décider : `MaintenanceRequestPolicy::decideQuote` | inchangées (TCK-2958) |
| `maintenance.quote_awaiting_owner` | idem | `maintenance_request` | fil de l'intervention | décider : le bailleur, par `decideQuote` | inchangées |
| `maintenance.slot_requested` | création d'une `MaintenanceRescheduleRequest` (`MaintenanceRescheduleRequestController@store`) | `maintenance_request` | fil de l'intervention | poser un créneau : donneur d'ordre et prestataire | `slots` (instants proposés) |
| `maintenance.slot_set` | `MaintenanceScheduleChanged` | `maintenance_request` | fil de l'intervention | — | `scheduled_at` |
| `visit.confirmed` | `VisitSchedulingService::confirmOrFail` (point commun de `confirm`, `bulk-confirm` et de la confirmation par le bailleur) | `property_visit` | fil du prospect **existant** | — | `scheduled_at` |
| `visit.rescheduled` | `VisitSchedulingService::rescheduleOrFail` | `property_visit` | fil du prospect **existant** | confirmer : l'autre partie, par `PropertyVisitPolicy` | `scheduled_at` |
| `booking.confirmed` | `BookingService::confirm` (l'acceptation d'une contre-offre, `BookingCounterOfferService::accept`, l'appelle : un seul point) | `booking` | salle de la réservation | — | — |

## Contraintes strictes (métier)

- **Un fil absent ne fait rien, et ne fait jamais échouer le geste** : pas de salle (locataire et
  bailleur sans compte), pas de fil de prospect, pas de fil d'intervention → aucun événement, aucune
  exception remontée à la requête ou au job. La visite **n'ouvre pas** de fil de prospect
  (`PropertyConversationResolver::findExisting`, lecture pure).
- **Après le COMMIT** : `LeaseEarlyTerminationRequested` et `LeaseRenewed` ne sont pas
  `ShouldDispatchAfterCommit` ; leur écouteur l'est
  (`ShouldHandleEventsAfterCommit`), ou l'écriture passe par `DB::afterCommit`. Aucun événement ne
  précède la donnée qu'il annonce.
- **Les deux chemins** du paiement (en ligne, à la main) et de la quittance écrivent le même code :
  un test par chemin.
- **Une seule écriture par fait** : le job de relance a déjà un marqueur par jalon (`metadata`, sous
  verrou) ; l'événement s'écrit sous ce même marqueur, jamais à chaque passage du job.
- **Aucune donnée sensible dans `data`** : pas de montant (le montant de l'échéance se lit par la
  projection, pour le lecteur), pas de pénalité, pas de moyen de paiement nominatif au-delà de son
  code. Le test d'architecture de TCK-2958 parcourt les codes neufs.
- **Salle de réservation** : chaque écriture d'événement y transmet d'abord la salle au contact
  principal actuel (TCK-2960, `SallesDuFil::synchroniser`).
- Les avis d'intervention qui n'ont pas de geste attendu gardent `action_for` vide (TCK-2958).

## Delta à produire

- [ ] `CodesDuFil` : les codes du tableau, avec leurs clés de `data`.
- [ ] `App\Services\Messaging\FilDeLObjet` (ou nom équivalent) : le fil où parle un objet (salle du
  bail d'une échéance ou d'un état des lieux, salle de réservation, fil d'intervention, fil de
  prospect existant d'une visite), `null` sinon.
- [ ] Un écouteur par événement Laravel existant (`LeasePaymentSettledOnline`,
  `LeaseEarlyTerminationRequested`, `LeaseRenewed`, `MaintenanceScheduleChanged`) ; un appel à
  `EvenementsDuFil` aux points sans événement (`SendLeasePaymentReminders`,
  `LeasePaymentReminderController@store`, `LeasePaymentService::markPaid`, `InventoryService::submit`,
  `MaintenanceRescheduleRequestController@store`, `VisitSchedulingService::confirmOrFail` et
  `rescheduleOrFail` (sous leur verrou : écriture par `DB::afterCommit`), `BookingService::confirm`).
- [ ] `SyncMaintenanceConversation` : `action_for` pour `quote_submitted` et `quote_awaiting_owner`.
- [ ] Tests `EvenementsDesObjetsTest` (un par ligne du tableau) : le code, l'objet, le fil, les clés
  de `data`, `action_for` ; **et** pour chaque ligne « sans fil » : le geste réussit, aucun message.
  Tests dédiés : paiement en ligne et à la main ; quittance des deux chemins ; relance du job écrite
  une fois sur deux passages ; événement non écrit si la transaction est annulée.

## Critères d'acceptation

- [ ] **AC1** — Chaque ligne du tableau écrit, dans le bon fil, un `event` au code, à l'objet, aux
  clés de `data` et à `action_for` attendus. *Ablation : débrancher un écouteur rend rouge sa ligne et
  elle seule.*
- [ ] **AC2** — Le locataire voit le fil de son bail non lu à l'échéance J-3 ; le bailleur et l'agent
  non. *Ablation : `action_for` vide rend rouge le cas du locataire.*
- [ ] **AC3** — Un devis soumis rend le fil d'intervention non lu pour qui peut le décider, et pour
  lui seul ; le locataire demandeur ne le voit pas compter.
- [ ] **AC4** — Un paiement à la main et un paiement en ligne écrivent tous deux `lease_payment.paid`
  et `lease_payment.receipt_issued`. *Ablation : retirer l'appel de `markPaid` rend rouge le chemin à
  la main seul.*
- [ ] **AC5** — Sans salle, sans fil de prospect ou sans fil d'intervention, le geste réussit et rien
  ne s'écrit ; aucune visite ne crée de fil.
- [ ] **AC6** — Une transaction annulée n'écrit aucun événement (`LeaseRenewed` lancé dans une
  transaction qui échoue).
- [ ] **AC7** — Aucun `data` ne porte un montant : le test d'architecture de TCK-2958 couvre les codes
  neufs sans modification.
- [ ] Pint propre ; tests des classes touchées verts.

## Hors périmètre

- Le rendu de ces événements à l'écran, repliés ou en carte : TCK-2962 et TCK-2963.
- Un fil de prospect créé par une visite ; une salle de visite ou d'état des lieux (décision 3a).
- Les événements de la réservation autres que l'acceptation (refus, annulation, expiration).
- Les engagements nés d'un événement : lot 3.
- Le relais par WhatsApp ou SMS d'un événement : lot 5.

## Notes d'implémentation

_(à remplir par implementing-specs)_
