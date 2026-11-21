---
id: TCK-2993
title: Profils de clavier et placeholders sur le reste de /app
status: todo
phase: P2
family: front
estimate: L
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: [TCK-2991]
blocks: [TCK-2994]
spec_refs:
  features: []
  models: []
tags: [front, mobile, formulaires, clavier, adr-0135]
---

## Objectif utilisateur

Dans la console, saisir un bail, un loyer, une intervention ou un réglage d'agence ouvre le bon clavier, avec un
exemple de la valeur attendue.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0135 § 1 à § 3.

## Delta

Les champs de `/app` hors TCK-2992 : baux, loyers et paiements, maintenance, biens et inventaire, CRM, visites,
tâches, prestataires, pipeline, documents, clients, propriétaires, agents, agence et son administration
(`admin/*` hors `admin/super`, `admin-*`), facturation, commissions, rapports, pièces, médias, console. La base
de `check:champs` descend d'autant.

## Critères d'acceptation

- [ ] AC1 — Plus aucun défaut `check:champs` dans ces dossiers.
- [ ] AC2 — Chaque champ quitté `type="number"` est vérifié dans son formulaire (valeur vide, bornes, envoi).
