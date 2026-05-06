---
id: TCK-190
title: Calendrier owner — lisibilité gros portefeuille
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-072]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#5-booking
    - docs/models-spec.md#17-propertyvisit-
    - docs/models-spec.md#14-lease-
tags: [front, owner, calendar, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire avec un gros portefeuille doit comprendre son agenda sans être noyé par les événements.

## Contrat de données

Le calendrier agrège les réservations, visites et périodes liées aux baux. L'UI doit présenter les types d'événements, filtres et détails sans modifier le contrat de données.

## Direction UX / Artistique

Calendrier de gestion dense mais lisible : légende permanente, regroupement visuel par type, journée sélectionnée avec détail latéral ou section dédiée, filtres rapides par bien/type.

## Contraintes strictes (métier)

- Le scope owner reste limité aux biens du portefeuille.
- Les filtres ne doivent pas masquer silencieusement des événements sans indication active.
- Les événements réservation, visite et bail doivent rester distinguables.

## Delta à produire

- [ ] Ajouter une légende couleur/type visible sur `/app/calendar`.
- [ ] Améliorer la vue mois pour limiter la surcharge visuelle sur gros portefeuille.
- [ ] Ajouter un détail du jour sélectionné ou une liste contextualisée.
- [ ] Vérifier le filtre par bien sur un portefeuille owner large.
- [ ] Tests frontend sur légende, filtres actifs et rendu d'événements multiples.

## Critères d'acceptation

- [ ] Réservation, visite et bail ont des libellés/couleurs explicités.
- [ ] Une journée avec de nombreux événements reste lisible et affiche un accès au détail complet.
- [ ] Le filtre par bien met à jour la vue et affiche son état actif.
- [ ] Cliquer un événement ouvre la fiche correspondante ou son panneau détail.

## Hors périmètre

- Changement d'API calendrier.
- Multi-select avancé de biens côté backend.
- Intégration calendrier externe.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
