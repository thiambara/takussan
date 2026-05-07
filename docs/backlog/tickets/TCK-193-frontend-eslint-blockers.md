---
id: TCK-193
title: Frontend — corriger les erreurs ESLint bloquantes
status: done
phase: P1
family: technique
estimate: S
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#11-review
    - docs/models-spec.md#21-maintenancerequest-
tags: [front, lint, react-hooks, ci, technical-debt]
---

## Objectif utilisateur

Les utilisateurs conservent des écrans avis et maintenance stables pendant que l'équipe rétablit un lint global exploitable.

## Contrat de données

Les écrans concernés consomment les données d'avis publics et de demandes de maintenance déjà spécifiées dans les domaines référencés.

## Direction UX / Artistique

Préserver le rendu actuel ; l'objectif est de supprimer les erreurs de hooks sans modifier l'expérience visible.

## Contraintes strictes (métier)

- Les permissions et scopes existants des avis et de la maintenance ne doivent pas changer.
- Les corrections ne doivent pas masquer les règles ESLint ni désactiver `react-hooks/set-state-in-effect`.
- Les états chargement, vide et erreur existants doivent rester équivalents.

## Delta à produire

- [ ] Corriger l'erreur ESLint `react-hooks/set-state-in-effect` dans `PropertyReviews.tsx`.
- [ ] Corriger l'erreur ESLint `react-hooks/set-state-in-effect` dans `MaintenanceNewLauncher.tsx`.
- [ ] Vérifier que les warnings restants ne bloquent pas `npm run lint`.
- [ ] Ajouter ou adapter des tests ciblés si une logique de synchronisation d'état est déplacée.

## Critères d'acceptation

- [ ] `npm run lint` ne remonte plus d'erreur ESLint.
- [ ] Les avis de fiche bien gardent le même comportement d'éligibilité pour utilisateur connecté et non connecté.
- [ ] Le launcher maintenance garde son auto-sélection valide quand un bien initial est fourni.
- [ ] Aucune règle ESLint n'est désactivée pour contourner les erreurs.

## Hors périmètre

- Refactor complet des pages avis ou maintenance.
- Correction des warnings ESLint non bloquants.
- Correction des erreurs TypeScript globales, couvertes par TCK-194 et TCK-195.

## Notes d'implémentation

L'éligibilité avis et la sélection maintenance sont dérivées des données courantes pour éviter les écritures d'état synchrones dans les effets React.
