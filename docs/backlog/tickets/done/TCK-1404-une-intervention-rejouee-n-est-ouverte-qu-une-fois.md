---
id: TCK-1404
title: "Une demande d'intervention rejouée sous la même clé n'est ouverte et notifiée qu'une fois"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1396]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, maintenance, idempotence, pistes]
---

## Contexte

Réf : **P144.06** du fichier de pistes, `validé` par le porteur. Deux `POST /api/maintenance-requests` identiques d'un locataire ouvraient deux interventions et prévenaient deux fois le bailleur ; `MaintenanceForm` garde la saisie et les photos après une erreur.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 2 : la clé sur `POST /api/maintenance-requests`

## Objectif

La demande renvoyée après une réponse perdue rend la première intervention, sans seconde notification.

## Delta à produire

- [x] `maintenance-requests.store` porte `idempotent`, ajoutée à `IdempotentRoutesTest`.
- [x] `useCreateMaintenanceRequest` passe `idempotence: true`.
- [x] Tests : `tests/Feature/Idempotence/InterventionRejoueeTest.php`, `src/lib/queries/__tests__/maintenance.idempotence.tck-1404.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux envois de la même demande sous la même clé, à 30 s d'écart : une intervention, le même `id` rendu, aucune notification de plus.
- [x] AC2 — Le hook demande l'option.

## Hors périmètre

- Le téléversement des photos, second appel de `MaintenanceForm` après la création : si lui seul échoue, la création a réussi et la clé est renouvelée, si bien qu'un nouvel envoi du formulaire ouvre une seconde intervention. Ce chemin n'a pas été mesuré par l'angle 144.

## Notes d'implémentation

- Ablation : route sans `idempotent` → `InterventionRejoueeTest` rouge (2 interventions) et `IdempotentRoutesTest` rouge ; option retirée du hook → 1 rouge vitest ; remis → verts.
