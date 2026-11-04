---
id: TCK-1380
title: "Les demandes de passage au plan supérieur se lisent une fois par rendu"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-138--lectures-de-lapi-dédoublées-dans-un-même-rendu-serveur"
tags: [web, performance, agence, pistes]
---

## Contexte

Réf : **P138.06** du fichier de pistes, `retenu · autonome` (A2). Le layout de `/app` et
`/app/settings/agency/upgrade` appelaient chacun `fetchAgencyUpgradeRequests` avec les mêmes
arguments, hors `cache()` : deux `GET /api/agencies/{id}/upgrade-requests` identiques par document.

## Delta à produire

- [x] `fetchAgencyUpgradeRequests` sous `cache()` de React ; l'avalement d'erreur du layout reste
      hors de la promesse partagée.
- [x] Garde : `src/lib/queries/__tests__/agency-upgrade.lecture-du-rendu.tck-1380.test.ts`.

## Critères d'acceptation

- [x] AC1 — Deux appels de même jeton et même agence dans un rendu : une requête.
- [x] AC2 — Sur une panne, le layout avale (`null`) et la page reçoit l'erreur.

## Notes d'implémentation

- Le module est aussi importé par des composants client (`UpgradeRequestForm`) : `cache()` y est
  un passe-plat, sans effet.
- Ablation : `cache` remplacé par l'identité → 1 rouge (`called 2 times`) ; remis → 2 verts.
