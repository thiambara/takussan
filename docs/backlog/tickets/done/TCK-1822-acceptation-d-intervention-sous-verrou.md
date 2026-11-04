---
id: TCK-1822
title: "L'acceptation d'une intervention juge ses gardes sur la ligne relue sous verrou"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-182--gestes-de-transition-rejoués-sur-un-état-déjà-atteint"
tags: [back, maintenance, concurrence, pistes]
---

## Contexte

Réf : **P182.07** du fichier de pistes (« Petites améliorations » de l'angle 182),
`retenu · autonome` pour l'acceptation seule (A1 : la garde `maintenance.already_accepted` écrit
déjà le contrat). La partie « abonnement d'agence » de la `Piste` est conditionnelle (« si la
console le lit ») ; le mesureur a établi que la console ne lit pas le corps : rien à faire.

`MaintenanceRequestService::accept` jugeait `accepted_at` sur le modèle reçu, sans verrou :
deux acceptations simultanées passaient toutes deux et émettaient deux `MaintenanceStatusChanged`.

## Delta à produire

- [x] `accept` relit la ligne par `lockForUpdate` dans une transaction et y juge
      `maintenance.terminal_request` et `maintenance.already_accepted` ; l'événement part après.
- [x] Test `tests/Feature/Maintenance/MaintenanceAcceptSousVerrouTest.php`.

## Critères d'acceptation

- [x] AC1 — Une acceptation sur un modèle chargé avant une première acceptation lève 422
      `maintenance.already_accepted`, sans second événement, et `accepted_at` reste celui du premier.
- [x] AC2 — Une intervention assignée s'accepte toujours, avec un événement.

## Hors périmètre

- L'autorisation `respondToAssignment` reste jugée sur le modèle lié à la route : un refus
  (`decline`) concurrent qui retire l'assignation n'est pas rejugé sous le verrou.
- La réponse de `cancel` de l'abonnement d'agence (non lue par la console, mesure du mesureur).

## Notes d'implémentation

- Ablation : service rendu à `pre-dev` → 1 rouge sur 2 (la seconde acceptation passe) ; remis →
  2/2 verts.
