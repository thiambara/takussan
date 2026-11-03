---
id: TCK-1264
title: "L'échéancier du bail nomme chaque statut de paiement, et une restitution n'y passe jamais en retard"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-146--unions-de-statut-et-options-de-filtre-du-front-face-aux-enums-de-lapi"
tags: [front, leases, i18n, pistes]
---

## Contexte

Réf : **P146.02** du fichier de pistes, `validé (délégué)`. Elle ouvre le lot de l'angle 146.

`displayStatus` (`components/leases/LeaseSchedule.tsx`) ne connaît que `cancelled`, `paid`,
`late` et `pending` : une échéance `refunded`, `failed` ou `partially_paid`, que l'API écrit,
s'affiche « Autre ». Une restitution de dépôt (`deposit_refund`) `pending` échue passe « En
retard », en rouge, alors que c'est l'agence qui la doit.

## Décision du porteur (déléguée)

> faire suivre à `displayStatus` les statuts `refunded`, `failed` et `partially_paid` de `PaymentStatus`, avec les libellés existants de `payments.status` (`Remboursé`, `Échec`, `Partiellement payé`) recopiés sous `lease.schedule.status` (`wo` = texte français) ; une ligne `deposit_refund` ne passe jamais `late`, elle garde son statut ; garde : un test de `LeaseSchedule` par statut de l'enum et un test d'une restitution `pending` échue qui n'affiche pas « En retard »

## Objectif utilisateur

Le locataire et l'agence lisent dans l'échéancier le vrai état de chaque échéance.

## Contrat de données

Aucun changement d'API. `GET /api/lease-payments?filter[lease_id]=…` rend `status` parmi les
cas de `PaymentStatus` et `payment_type`, déjà lus.

## Delta à produire

- [x] `displayStatus` rend `refunded`, `failed` et `partially_paid` ; la dérivation `pending`
  échu → `late` ne s'applique pas à une ligne `deposit_refund`.
- [x] `lease.schedule.status.{refunded,failed,partially_paid}` dans `fr`, `en`, `wo` (libellés de
  `payments.status` ; `wo` = texte français).
- [x] `LeaseSchedule.test.tsx` : un cas par statut de l'enum, et la restitution `pending` échue.

## Critères d'acceptation

- [x] AC1 — Aucun des sept cas de `PaymentStatus` ne s'affiche « Autre ».
- [x] AC2 — Une restitution `pending` dont l'échéance est passée affiche « À venir », sans le fond
  rouge des retards.

## Hors périmètre

- Le ton du badge : `refunded`, `failed` et `partially_paid` gardent le badge `outline` (la
  décision ne porte que sur les libellés).
- Une garde qui confronte les statuts du front aux enums de l'API (P146.04, au porteur).

## Notes d'implémentation

- Hypothèse : « elle garde son statut » ne vise que la dérivation côté client ; un `late` écrit
  par l'API (que rien ne pose aujourd'hui sur une restitution) s'afficherait tel quel.
- Ablation : `LeaseSchedule.tsx` rendu à `HEAD`, traductions gardées → 4 rouges (`partially_paid`,
  `failed`, `refunded`, restitution) ; correctif remis → 29/29 verts.
