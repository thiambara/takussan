---
id: TCK-2993
title: Profils de clavier et placeholders sur le reste de /app
status: done
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

- [x] AC1 — Plus aucun défaut `check:champs` dans ces dossiers.
- [x] AC2 — Chaque champ quitté `type="number"` est vérifié dans son formulaire (valeur vide, bornes, envoi).

## Relevé (2026-11-21)

Deux lots délégués (C : baux, loyers, maintenance, biens, visites… ; D : administration d'agence, facturation,
rapports, clients…), 83 fichiers, 76 clés ; puis la fiche d'agence (`ChampDeLaFiche`, que la garde ne voyait pas)
reprise par la session. Les valeurs numériques passent par `lireNombre` ; la fiche garde ses chaînes
(`garderLeTexte`).
