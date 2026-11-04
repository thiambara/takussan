---
id: TCK-2187
title: "Le rappel d'état des lieux et le repli d'expiration jugent l'administrateur principal joignable"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2185]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-225--ce-que-lagence-attache-à-son-administrateur-principal-quand-ce-compte-part"
tags: [api, notifications, baux, reservations, pistes]
---

## Objectif

Le rappel « agent » de `RemindTenantOnboarding` et le dernier repli de
`BookingExpirationService` visent l'administrateur principal s'il est joignable, et sinon les
administrateurs que rend `AdminsDeLAgence::destinataires`.

## Contexte

Réf : **P225.02** du fichier de pistes, `validé (délégué)` (V7 accordé).

Les deux sites lisaient `agency.primaryAdmin` sans juger le compte : bloqué, l'avis partait au
compte fermé (`Notification::send()` et `->notify()` ne passent pas par le filtre de
`NotificationService`), et à personne d'autre.

## Décision du porteur (déléguée)

validé (délégué) — le rappel « agent » de `RemindTenantOnboarding` et le dernier repli de `BookingExpirationService::resolveFallbackAgent` visent l'administrateur principal s'il est joignable (`PrimaryPropertyContact::joignable`), et sinon les administrateurs que rend `AdminsDeLAgence::destinataires` (le locataire toujours écarté du rappel « agent »), la règle de P225.01 ; test : un par site, administrateur principal bloqué et co-administrateur actif → l'avis part au co-administrateur, 0 au compte bloqué ; reste : le repli du verdict KYC (`KycWorkflowService::notifyReviewed`), qu'élargir à un administrateur sans `agency.update_kyc` reviendrait sur TCK-1763

## Reste à faire

le repli du verdict KYC (`KycWorkflowService::notifyReviewed`), qu'élargir à un administrateur sans `agency.update_kyc` reviendrait sur TCK-1763

## Delta à produire

- [x] `RemindTenantOnboarding` : `AdminsDeLAgence::principalSinonDestinataires` (TCK-2185), le
  locataire écarté.
- [x] `BookingExpirationService::resolveFallbackAgents` rend une collection : l'auteur agent de
  l'agence, sinon la même règle.
- [x] `ReplisSansAdministrateurPrincipalJoignableTest` : un cas par site, et un témoin.

## Critères d'acceptation

- [x] AC1 — principal bloqué, co-administrateur actif : le rappel et l'avis d'expiration partent au
  co-administrateur, 0 au compte bloqué.
- [x] AC2 — principal joignable : seul destinataire, sur les deux sites.

## Notes d'implémentation

- Avant correctif : 2 rouges (le témoin passe : le repli d'expiration sert bien quand
  `BookingStakeholders::for` ne rend que le client).
- Ablation : la règle remise à « le principal tel quel » → 2 rouges ; remise → 3 verts.
