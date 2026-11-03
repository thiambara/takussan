---
id: TCK-1722
title: "L'agent qui a saisi un bien d'agence confirme, annule, ouvre, renouvelle et résilie sous les capacités de son rôle"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1718]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-160--propertiesuser_id-lu-comme-le-bailleur-dans-une-décision-métier"
tags: [api, autorisation, reservations, baux, pistes]
---

## Contexte

Réf : **P160.03** du fichier de pistes (🔴, `validé`). `BookingPolicy::landlordOf` passait
`properties.user_id` à `landlordWrites`, qui ne refuse que le bailleur `blocked` ; `LeaseService::create`
acceptait `property->user_id === user` sans `leases.create`, et écrit `landlord_id = property->user_id`.
L'agent qui a saisi le bien était donc « bailleur » de ses réservations et des baux qu'il ouvrait, et
les branches `landlordWrites($user, $lease->landlord_id, …)` de `LeasePolicy` passaient avant toute
capacité. Mesuré : un agent sans `bookings.validate`, `bookings.cancel`, `leases.create`,
`leases.terminate`, `leases.renew`, `leases.refund_deposit` confirmait, annulait, ouvrait un bail, le
renouvelait, le résiliait et en rendait le dépôt.

**Décision du porteur** : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Le critère accordé est V2 et V1 (dépôt rendu).

## Objectif utilisateur

L'agent qui a saisi un bien d'agence agit sur ses réservations et ses baux au titre du personnel,
sous les capacités que son rôle lui donne.

## Delta à produire

- [x] `BasePolicy::bailleurEcrit()` : `BailleurDuBien::est()` (TCK-1718) puis `landlordWrites`. Le
  prédicat partagé que demande la `Piste`, appelé par les appelants qui reçoivent
  `properties.user_id` ou `leases.landlord_id`.
- [x] `BookingPolicy::landlordOf` et toutes les branches bailleur de `LeasePolicy` l'appellent.
- [x] `LeaseService::create` : la branche « bailleur du bien » lit `BailleurDuBien::est()`.
- [x] `tests/Feature/Authorization/AgentCreateurReservationsEtBauxTest.php`.

**Choix de l'implémenteur** (voie la plus étroite) : `landlordWrites` lui-même ne change pas. Il
reçoit aussi des colonnes d'auteur (`conducted_by`, `uploaded_by`) où l'auteur n'est pas un
bailleur, et y exiger un profil propriétaire retirerait des gestes que la piste ne mesure pas. Le
prédicat s'applique à toutes les branches bailleur de `LeasePolicy` (y compris `update`,
`recordPayment`, `reviewRent`), puisque la `Piste` demande qu'il vaille pour le `landlord_id` d'un
bail tant que ce champ peut désigner un agent ; le personnel y garde les gestes de sa branche.

## Critères d'acceptation

- [x] AC1 — agent créateur sans les six capacités : `validate`, `cancel`, `renew`,
  `requestEarlyTermination`, `confirmEarlyTermination`, `refundDeposit` refusés, et
  `LeaseService::create` → 403 sans bail créé.
- [x] AC2 — le même agent au rôle système : tous accordés, bail créé.
- [x] AC3 — le bailleur du bien : tous accordés sans capacité d'agence.

## Hors périmètre

- Le bail créé par l'agent porte encore `landlord_id` = l'agent (P15.06, TCK-997).
- `InventoryPolicy`, `DocumentPolicy` et `PropertyVisitPolicy` passent aussi `properties.user_id` à
  `landlordWrites` : hors de la `Piste`, non mesurés, et la branche bailleur de `PropertyVisitPolicy`
  ne décide déjà que pour un bien sans agence.
- Le membre **retiré** (P153.02, PR #1200) : la PR #1200 modifie aussi `BookingPolicy::landlordOf`,
  avec une règle équivalente (profil propriétaire de tout statut) ; la seconde fusionnée se réconcilie.

## Notes d'implémentation

- Ablation : `BookingPolicy`, `LeasePolicy` et `LeaseService` rendus à `origin/pre-dev` (le nouveau
  `bailleurEcrit` restant sans appelant) → AC1 rouge des deux côtés (les six gestes accordés ; bail
  ouvert), AC2 et AC3 verts ; correctifs remis → 5 verts.
- Piège : `LeaseService::create` refuse aussi, par 403, un locataire hors du périmètre de
  l'émetteur. Le premier jet du test prenait un client quelconque et passait **sans** le correctif ;
  le locataire est désormais un client de l'agence saisi par l'agent, et le témoin AC2 prouve qu'il
  est accepté.
- Rejouées une à une, les 70 classes qui citent `LeasePolicy`, `LeaseService`, `BookingPolicy`,
  `/api/leases` ou les gestes touchés (hors celles de TCK-1720) : toutes vertes.
  `MigratedAuthorizationRulesTest` rougissait sur un « bailleur » sans aucun profil dans l'agence du
  bail ; il en reçoit un.
