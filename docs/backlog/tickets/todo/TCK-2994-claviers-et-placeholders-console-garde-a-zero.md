---
id: TCK-2994
title: Profils de clavier et placeholders de la console d'exploitation — la garde des champs à zéro
status: todo
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: [TCK-2992, TCK-2993]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, formulaires, clavier, adr-0135]
---

## Objectif utilisateur

Plus aucun champ de l'application n'ouvre le mauvais clavier ni n'arrive sans exemple ; la règle n'a plus
d'exception.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0135 § 1 à § 4.

## Delta

Les champs de la console d'exploitation (`admin/super`, `super-admin`, `boost/admin`) et tout ce que les deux
lots précédents n'ont pas couvert. `scripts/champs-baseline.json` devient vide ; la garde n'a plus de base.

## Critères d'acceptation

- [ ] AC1 — `npm run check:champs` : zéro défaut, base vide.
- [ ] AC2 — Chaque champ quitté `type="number"` est vérifié dans son formulaire.
