---
id: TCK-514
title: "Documentation — le guide d'hébergement Dokploy remplace le guide de premier déploiement"
status: todo
phase: P0
family: technique
estimate: S
wave: 64
created: 2026-09-13
updated: 2026-09-13
depends_on: [TCK-513]
blocks: [TCK-515]
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, documentation, adr-0028]
---

## Objectif utilisateur

Que la personne qui reprend le serveur trouve dans le dépôt ce qui sert quoi, ce qui vit hors du
dépôt, et les commandes qui le re-mesurent — sans lire un guide qui décrit une chaîne retirée.

## Contrat de données

Décision : [ADR-0028](../../adr/0028-auto-hebergement-conteneurise-sur-le-vps.md). Contenu :
[plan, tâche B6](../../plans/2026-09-13-auto-hebergement-vps-dokploy.md#tâche-b6--la-documentation).

## Contraintes strictes (métier)

- Aucune valeur de variable dans le relevé : seulement les clés, et où vivent les valeurs.
- Plus aucun document vivant ne cite `deploy.sh`, `server-setup.sh` ou les workflows retirés comme un présent.

## Delta à produire

- [ ] `docs/infra/hebergement.md` ; retrait de `premier-deploiement.md` et `deploy-preview.html`, liens réparés
- [ ] `docs/infra/versions.{json,md}`, `docs/ardoise.md` (D-04, D-10), `CLAUDE.md`
- [ ] retrait du marqueur `lien-mort-assumé` d'ADR-0028

## Critères d'acceptation

- [ ] AC1 — `check-doc-links.mjs` vert, sans le marqueur d'ADR-0028
- [ ] AC2 — le `grep` de B6 ne rend que des lignes au passé ou en récit
- [ ] AC3 — toutes les gardes et les deux générateurs verts

## Hors périmètre

- Le relevé des valeurs mesurées sur le serveur, rempli en D (TCK-515).

## Notes d'implémentation

_(à remplir par implementing-specs)_
