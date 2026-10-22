---
id: TCK-1469
title: "L'avis « reversement à approuver » mène à l'onglet des approbations de `/app/payments`"
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

Réf : **P161.02** du fichier de pistes, `validé (délégué)` (critère V7 accordé).

`PayoutService::notifyApprovers` envoie `payout.awaiting_approval` à `PayoutApprovers::holders`
(agents et admins actifs, délégataires `agent|agency_admin`, filtrés par `payouts.approve`) avec
la cible `finances`. Cette page est fermée à qui n'est pas admin de l'agence, et n'a de toute façon
aucun geste d'approbation : la file « À approuver » vit sur `/app/payments`, onglet `approvals`
(TCK-594, ADR-0039 § 4).

## Décision du porteur (déléguée)

validé (délégué) — `PayoutAwaitingApproval` vise un genre neuf vers `/app/payments?tab=approvals`, pour tout détenteur de `payouts.approve`, admins compris ; test : détenteur non admin → cible `/app/payments?tab=approvals`

## Reste à faire

l'avis d'assouplissement du seuil (filtrer ses destinataires ou suivre l'issue de P148.01), au porteur

## Contrat de données

- `NotificationTarget::PATHS` gagne `payout_approvals` → `/app/payments?tab=approvals`.
- `notifyApprovers` l'emploie pour chaque destinataire, sans distinction de profil.

## Delta à produire

- [x] Genre `payout_approvals` dans `NotificationTarget::PATHS`.
- [x] `PayoutService::notifyApprovers` : cible `payout_approvals`.
- [x] Test dans `PayoutApprovalTest`.

## Critères d'acceptation

- [x] AC1 — un agent dont le rôle personnalisé porte `payouts.approve` reçoit l'avis, cible
  `/app/payments?tab=approvals`.
- [x] AC2 — un admin de l'agence reçoit la même cible.

## Hors périmètre

- `PayoutThresholdRelaxRequested` garde sa cible `agency_settings` (reste ci-dessus).

## Notes d'implémentation

- Ablation : cible `finances` remise → 1 rouge, remis → 9/9 verts.
