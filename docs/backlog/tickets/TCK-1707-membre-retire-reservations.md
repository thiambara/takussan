---
id: TCK-1707
title: "Le membre retiré ne lit, ne confirme ni n'annule plus les réservations des biens qu'il a saisis"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features: ["docs/features.md#112-agence--équipe"]
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-153--ce-que-le-retrait-en-leave_unassigned-laisse-au-nom-du-retiré-et-ce-qui-le-lit-encore"
tags: [back, agence, autorisation, reservation, pistes]
---

## Objectif utilisateur

L'agent retiré en `leave_unassigned` ne lit plus les réservations des biens d'agence qu'il avait
saisis (téléphone du client compris) et ne les confirme, ne les refuse ni ne les annule plus.

Réf : **P153.02**.

## Décision du porteur

- P153.02 : validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Critère accordé : V2 (et V3 pour le téléphone exposé).

**Choix de l'implémenteur.** La piste propose `PrimaryPropertyContact::estProprietaire` (bailleur
**actif** et joignable). Pris à la lettre, il retirerait aussi la **lecture** au bailleur suspendu,
qu'ADR-0031 §2 lui garde (« il reste partie ») et que `BasePolicy::landlordWrites` écrit. La voie
retenue est la plus étroite qui tient les deux tests de la piste : sur un bien d'agence, l'auteur
ne vaut propriétaire que s'il détient un **profil de bailleur, de tout statut**, dans l'agence du
bien (`BookingPolicy::ownerOfProperty`) ; les gestes `validate` et `cancel` gardent en plus
`landlordWrites` (suspendu refusé). L'agent auteur encore membre passe par sa branche de personnel
(`isStaffOf`, et `bookings.validate` / `bookings.cancel` pour les gestes).

## Delta à produire

- [x] `BookingPolicy::ownerOfProperty` remplace `property.user_id === user.id` dans `view` et
  `update`, et précède `landlordWrites` dans `landlordOf` (`validate`, `cancel`).
- [x] Test : `MembreRetireReservationsTest` (2 cas).

## Critères d'acceptation

- [x] AC1 — agent auteur retiré : `view`, `update`, `validate`, `cancel` faux ; `GET /api/bookings/{id}` et `POST …/confirm` → 403, réservation `pending`.
- [x] AC2 — bailleur actif auteur du bien : les quatre vrais ; suspendu : `GET` 200, `validate` faux.

## Hors périmètre

- Les avis de réservation envoyés au créateur du bien (P126.04, TCK-1316).

## Notes d'implémentation

- Ablation : `BookingPolicy` remise → AC1 rouge (`view` vrai) ; remise en place → 2/2.
- `MigratedAuthorizationRulesTest::test_booking_view_admits_creator_and_customer_but_update_does_not`
  prenait pour « propriétaire du bien » un compte sans profil dans l'agence : il reçoit un profil de
  bailleur.
