---
id: TCK-1180
title: "La fiche et la liste des réservations ne lisent que ce que l'API émet"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  models:
    - "docs/models-spec.md#5-booking"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-100--fields-du-front-face-aux-queryfields-et-ce-que-lécran-lit-hors-de-sa-demande"
tags: [back, front, reservations, contrat, pistes]
---

## Contexte

Réf : **P100.02** du fichier de pistes, `validé` (V7 accordé).

Le type `Booking` du front déclare `deposit_paid`, `deposit_date`, `completion_date`,
`rejection_date` et `expiration_date`, que `BookingResource` n'émet pas. Le badge « Acompte payé »
de la liste, le badge « Payé » et le bloc « Expire le » de la fiche, et les événements « Acompte
payé », « Soldée » et « Refusée » de la chronologie ne s'affichaient jamais.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

**Choix retenu** (la recommandation du délégué, la plus étroite) :
- « acompte payé » se dérive **au front** des `booking_payments` que le `show` rend déjà (paiement
  `deposit` au statut `paid`, daté de `paid_at`) ; l'API n'émet aucune clé neuve ;
- « Expire le » lit `expires_at` ;
- les clés sans source sortent du type, et avec elles ce qui ne s'affichait jamais : le badge de la
  liste (la liste ne charge pas les paiements, et y ajouter une requête serait un choix d'écran),
  les événements « Soldée » et « Refusée » (aucune date ne les porte, et en ajouter une est un
  schéma) ;
- garde : `BookingResourceContractTest` fige les clés de la ressource.

## Objectif utilisateur

La fiche d'une réservation montre l'acompte réglé et son échéance ; rien n'y lit une clé que l'API
n'émet pas.

## Delta à produire

- [x] `types/booking.ts` : cinq clés retirées, `paid_at` ajouté au paiement.
- [x] `BookingDetail.tsx`, `BookingsList.tsx`.
- [x] `BookingResourceContractTest`, `BookingDetail.faits-emis.tck-1180.test.tsx`.

## Critères d'acceptation

- [x] AC1 — clés de `BookingResource` figées, sans et avec `payments` chargés.
- [x] AC2 — acompte `paid` : badge « Payé » et événement « Acompte payé » ; acompte `pending` :
      ni l'un ni l'autre.
- [x] AC3 — « Expire le » s'affiche depuis `expires_at`.

## Hors périmètre

- `expired_at`, lu en premier repli de la chronologie et non émis : il se replie déjà sur
  `expires_at`, la piste ne le nomme pas.
- Les libellés devenus sans lecteur (`bookings.list.depositPaid`, `timeline.settled`,
  `timeline.rejected`) restent dans les messages.

## Notes d'implémentation

- Ablation API : `'deposit_paid' => false` remis dans la ressource → 2/2 rouges.
- Ablation front : `BookingDetail.tsx` d'avant → 2/3 rouges (badge, « Expire le »).
