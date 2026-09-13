---
id: TCK-516
title: "Vercel ne construit plus que master : les préproductions ne passent plus par lui"
status: todo
phase: P3
family: technique
estimate: S
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: [TCK-515]
blocks: [TCK-517]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, front, vercel, adr-0028]
---

## Objectif utilisateur

Qu'un commit de `dev` ou de `preview` ne reconstruise plus le front chez Vercel, qui ne sert plus
aucune préproduction — c'est le gaspillage que TCK-333 nomme.

## Contrat de données

[Plan, tâche E1](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-e1--plus-aucun-build-vercel-hors-de-la-production).
Relevé à tenir : `docs/infra/frontend-deploiement.json`.

## Contraintes strictes (métier)

- `ignoreCommand` sort en `0` (build ignoré) hors de `master` : le sens inverse de l'intuition.
- Le relevé suit la mesure (déploiement GitHub publié par Vercel), jamais le réglage supposé.

## Delta à produire

- [ ] `takussan-web/vercel.json` ; `web/vercel.json` dans `thiambara/check-print-plus`
- [ ] domaines de préproduction retirés des projets Vercel
- [ ] relevé `frontend-deploiement.{json,md}` mis à jour, garde `front-deploy-map` verte

## Critères d'acceptation

- [ ] AC1 — un commit de documentation poussé sur `dev` ne produit aucun build Vercel (mesure datée)
- [ ] AC2 — `front-deploy-map.yml` vert sur le relevé mis à jour
- [ ] AC3 — TCK-333 passe `done`, avec la mesure

## Hors périmètre

- Le retrait de Vercel de la production (TCK-517).

## Notes d'implémentation

_(à remplir par implementing-specs)_
