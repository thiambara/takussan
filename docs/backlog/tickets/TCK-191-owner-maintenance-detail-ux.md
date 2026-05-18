---
id: TCK-191
title: Maintenance owner — détail lisible
status: done
phase: P2
family: front
estimate: S
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-030, TCK-095, TCK-096]
blocks: []
spec_refs:
  features:
    - docs/features.md#18-maintenance--interventions
  models:
    - docs/models-spec.md#21-maintenancerequest-
    - docs/models-spec.md#3-property
tags: [front, owner, maintenance, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit comprendre une demande de maintenance et les devis associés sans voir d'identifiants techniques.

## Contrat de données

La demande de maintenance expose son bien, son demandeur, son assignation, son statut, sa priorité, ses devis et son historique. L'UI doit consommer les relations nécessaires plutôt que rendre des IDs bruts.

## Direction UX / Artistique

Détail d'intervention lisible : titre du bien, intervenant ou personne assignée, timeline, devis avec décision et actions claires, badges FR cohérents.

## Contraintes strictes (métier)

- Les actions de devis restent réservées aux rôles autorisés.
- Les transitions de statut doivent suivre la state-machine maintenance.
- Aucun ID interne ne doit être le seul libellé utilisateur quand une relation humaine existe.

## Delta à produire

- [ ] Fiche `/app/maintenance/[id]` : remplacer `BIEN #...` par titre/adresse du bien avec lien.
- [ ] Remplacer `Utilisateur #...` par nom/rôle de l'assigné si disponible.
- [ ] Afficher les devis avec montant, soumis le, décision, date décision et actions applicables.
- [ ] Uniformiser statuts/priorités en français.
- [ ] Tests frontend sur rendu sans IDs bruts quand relations chargées.

## Critères d'acceptation

- [ ] Une fiche maintenance owner affiche le titre du bien au lieu d'un ID brut.
- [ ] L'assigné est affiché par nom lisible si la donnée existe.
- [ ] Les décisions de devis sont compréhensibles et actionnables selon statut.
- [ ] Les priorités/statuts ne rendent pas `Low`, `High`, `Normal` en brut.
- [ ] Les actions interdites ne sont pas visibles.

## Hors périmètre

- Nouveau workflow de devis.
- Facturation directe prestataire.
- Contrats de maintenance récurrents.

## Notes d'implémentation

Le détail charge `property`, `requester`, `assignee` et `quoteDecisionBy` via `include=`. La resource expose des résumés lisibles pour éviter les libellés `BIEN #...` / `Utilisateur #...`; les IDs restent seulement dans les liens techniques.
