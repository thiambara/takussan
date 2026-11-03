---
id: TCK-1779
title: "Le numéro de carte de l'agent s'efface : `license_number: null` efface, le wizard envoie `null` pour un champ vidé"
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
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-149--champs-vidés-dun-patch-partiel-lus-comme--garder-"
tags: [api, front, agent, onboarding, pistes]
---

## Objectif utilisateur

L'agent qui a saisi un numéro de carte professionnelle par erreur peut le retirer : il vide le
champ, enregistre, et la carte n'est plus en base.

## Contexte

Réf : **P149.05** du fichier de pistes, `validé`.

Mesuré avant correctif sur `c4adeb298` : `PATCH /api/me/agent-profiles/{id}/specialization` avec
`license_number: null` garde la carte (`AgentProfileController::updateSpecialization`, test neuf
rouge : `'AGT-2026-001' is identical to null`) ; le wizard envoie `undefined` pour un champ vidé
(test neuf rouge : `license_number: undefined`).

## Décision du porteur

> porteur (2026-10-22) : ne valider que la carte : `array_key_exists` seul côté API (`null` efface) et le wizard envoie `null` pour un champ vidé ; les notes de clôture gardent « `null` = garder »

## Hypothèses (mode sans humain)

- « Champ vidé » = champ vide au moment d'enregistrer (`'' → null`). Le wizard ne lit pas la carte
  en base : il part d'un champ vide, que son brouillon (`agent-onboarding-<id>`) garde ensuite.
  Un agent qui reprend le parcours sans brouillon et enregistre l'étape sans retaper sa carte
  l'efface donc ; c'est la lecture littérale de la décision, notée ici.
- Les notes de clôture d'intervention (`MaintenanceRequestService`) ne bougent pas : la décision
  les garde en « `null` = garder ».

## Delta à produire

- [x] `updateSpecialization` : `array_key_exists` seul ; `null` écrit `null`.
- [x] `AgentOnboardingWizard` : `license_number: … || null`.
- [x] Tests : un cas dans `AgentOnboardingTest`, un dans `AgentOnboardingWizard.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Clé absente → la carte est gardée.
- [x] AC2 — `license_number: null` → la carte est effacée, et la réponse rend `null`.
- [x] AC3 — Le wizard envoie `license_number: null` pour un champ vidé.

## Notes d'implémentation

- Ablations : contrôleur rendu à `HEAD` → rouge (AC2) ; wizard rendu à `HEAD` → 1 rouge sur 6.
  Remis → verts.
