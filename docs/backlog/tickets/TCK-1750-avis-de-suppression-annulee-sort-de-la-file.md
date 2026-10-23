---
id: TCK-1750
title: "L'avis d'une demande de suppression annulée avant le worker sort de la file sans échec"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-166--modèles-portés-en-file-par-serializesmodels-supprimés-entre-lenvoi-et-le-worker"
tags: [api, notifications, file, compte, pistes]
---

## Contexte

Réf : **P166.01** du fichier de pistes, `validé (délégué)`.

`AccountDeletionRequestedNotification` et `AccountDeletionReminderNotification` portent
l'`AccountDeletionRequest`, modèle sans `SoftDeletes` que `cancelDeletion` supprime pour de bon.
Annulée avant le passage du worker, la demande manque à la désérialisation : le job échoue sans
essai en `ModelNotFoundException` et laisse une ligne `failed_jobs`, pour un avis qui n'a plus
d'objet.

## Décision du porteur (déléguée)

« marquer `#[DeleteWhenMissingModels]` (attribut de `Illuminate\Queue\Attributes`, que `SendQueuedNotifications` lit) les seuls `AccountDeletionRequestedNotification` et `AccountDeletionReminderNotification` ; test : file `database`, demande puis annulation avant le worker → aucune ligne `failed_jobs`, aucun courriel »

Critère accordé : V7.

## Reste à faire

« la garde de `NotificationsEnFileTest` sur toute notification en file portant un modèle sans `SoftDeletes`, et le marqueur des cinq autres avis (`AgencyUpgradeApproved/Rejected/RequestSubmittedNotification`, `InvitationAcceptedNotification`, `SuperAdminInvitedBroadcast`), au porteur »

## Delta à produire

- [x] `#[DeleteWhenMissingModels]` sur les deux avis.
- [x] Test : `AvisDeSuppressionAnnuleeAvantLeWorkerTest` (les deux avis, file `database`,
  `queue:work --once`).

## Critères d'acceptation

- [x] AC1 — Demande puis suppression de la demande avant le worker : `jobs` vide, aucune ligne
  `failed_jobs`, aucun courriel, pour chacun des deux avis.

## Notes d'implémentation

- Avant correctif : une ligne `failed_jobs` par avis (2 rouges).
- Ablation : les deux notifications remises à `HEAD` → 2 rouges ; remises → 2 verts.
