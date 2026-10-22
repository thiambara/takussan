---
id: TCK-1467
title: "Le rappel d'un reversement échu mène l'émetteur non admin à l'onglet des reversements"
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
  features:
    - "docs/features.md#23-notifications"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-161--cibles-de-notification-qui-ouvrent-un-écran-fermé-au-destinataire"
tags: [back, notifications, reversements, pistes]
---

## Contexte

Réf : **P161.01** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`payouts:remind-due` envoie `payout.due` à l'émetteur avec la cible `finances`
(`/app/agency/finances`), section fermée à qui n'est pas admin de l'agence. Le rôle système
d'agent porte `payouts.create` (TCK-528) : l'agent qui a programmé le reversement était renvoyé sur
l'accueil de `/app`.

## Décision du porteur (déléguée)

validé (délégué) — cible selon le destinataire : `finances` pour un admin de l'agence, sinon un genre neuf `payouts` vers `/app/payments?tab=payouts`, l'écran où l'émetteur a programmé le reversement ; test : émetteur agent → `/app/payments?tab=payouts`, émetteur admin → `finances`

## Contrat de données

- `NotificationTarget::PATHS` gagne `payouts` → `/app/payments?tab=payouts` (`PaymentsTabs` lit
  déjà `?tab=`).
- « Admin de l'agence » se lit `isAgencyAdminAt(<agence du reversement>)` (profil
  `AgencyAdminProfile` actif). Hypothèse : un admin d'une autre agence que celle du reversement
  n'ouvre pas les finances de celle-ci ; il reçoit la cible `payouts`.

## Delta à produire

- [x] Genre `payouts` dans `NotificationTarget::PATHS`.
- [x] `RemindDuePayouts::targetFor()` : `finances` pour l'admin de l'agence, `payouts` sinon.
- [x] Test dans `RemindDuePayoutsCommandTest`.

## Critères d'acceptation

- [x] AC1 — émetteur agent → cible `/app/payments?tab=payouts`.
- [x] AC2 — émetteur admin de l'agence → cible `/app/agency/finances`.
- [x] AC3 — émetteur admin d'une autre agence → cible `/app/payments?tab=payouts`.

## Hors périmètre

- La cible ne porte pas l'agence (P161.04, au porteur).

## Notes d'implémentation

- Ablation : `targetFor()` remplacé par `NotificationTarget::of('finances')` → 1 rouge (AC1),
  remis → 3/3 verts.
