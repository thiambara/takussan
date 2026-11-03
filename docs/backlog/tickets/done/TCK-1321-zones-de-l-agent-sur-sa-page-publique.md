---
id: TCK-1321
title: "Page publique de l'agent : ses zones d'intervention, saisies à l'assistant, affichées à côté de la spécialité"
status: done
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#35-agentprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [api, web, agent, public, pistes]
---

## Contexte

Réf : **P117.03** du fichier de pistes, `validé` (V7 accordé).

L'assistant de l'agent range ses zones dans `agent_profiles.metadata.intervention_zones`, et rien
ne les relisait : ni ressource, ni page publique (`PublicAgentController::show` ne rendait que
`specialty`).

## Décision du porteur

> porteur (2026-10-22) : garder l'étape et afficher les zones en lecture seule sur la page publique de l'agent, à côté de `specialty`

## Objectif

`GET /api/public/agents/{slug}` rend `intervention_zones`, et `/agents/{slug}` les affiche à côté
de la spécialité.

## Delta à produire

- [x] `PublicAgentController::show` : `intervention_zones` (chaînes non vides de la `metadata` du
      profil d'agent retenu, `[]` sans profil).
- [x] `AgentDto.intervention_zones` ; la page les ajoute à l'eyebrow, après la spécialité.

## Critères d'acceptation

- [x] AC1 — La fiche publique d'un agent aux zones `Plateau`, `Almadies` les rend dans
      `data.intervention_zones` ; sans profil, `[]`.
- [x] AC2 — La page affiche « … · Location · Plateau, Almadies ».

## Hypothèses

- « À côté de `specialty` » : dans l'eyebrow, juste après la spécialité, séparées par des
  virgules — sans libellé neuf. L'étape de l'assistant est gardée telle quelle.

## Hors périmètre

- L'index des profils publics (`PublicAgentController::index`), le filtre de l'annuaire et
  l'attribution des demandes : non demandés.

## Notes d'implémentation

- Ablation API : contrôleur d'avant remis → 2 rouges dans `PublicProfileTest` ; correctif → 13 verts.
- Ablation front : page d'avant remise → « sont affichées à côté de la spécialité » rouge ; → vert.
