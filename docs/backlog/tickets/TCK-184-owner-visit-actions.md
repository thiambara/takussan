---
id: TCK-184
title: Visites owner — confirmation et suivi
status: todo
phase: P2
family: front
estimate: M
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-075]
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
  models:
    - docs/models-spec.md#17-propertyvisit-
tags: [front, owner, visits, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit pouvoir gérer les demandes de visite sur ses biens et suivre leur avancement.

## Contrat de données

Le domaine visites expose les données `PropertyVisit`, ses statuts, types, créneaux, bien associé et actions de transition. L'écran owner doit consommer ces données avec les relations nécessaires au bien et au visiteur.

## Direction UX / Artistique

Vue de gestion de rendez-vous : onglets par statut, détail du créneau, action principale contextuelle, libellés humains pour les types de visite, historique minimal des changements.

## Contraintes strictes (métier)

- Les actions de confirmation et de clôture sont réservées aux owners/agents autorisés sur le bien.
- Une visite ne peut être marquée effectuée que si son statut et sa date le permettent.
- Les rappels et notifications restent déclenchés par les transitions métier existantes.
- Un owner ne doit jamais voir les visites d'un bien hors portefeuille.

## Delta à produire

- [ ] Liste `/app/visits` owner : onglets demandées/confirmées/passées/annulées avec compteur fiable.
- [ ] Fiche `/app/visits/[id]` owner : détails complets du bien, demandeur, type, date, durée, statut.
- [ ] Actions contextuelles : confirmer, annuler/replanifier si supporté, marquer effectuée.
- [ ] Feedback post-visite côté gestionnaire si la visite est terminée.
- [ ] Badges FR pour les types et statuts de visite.
- [ ] Tests frontend sur les actions visibles par rôle/statut.

## Critères d'acceptation

- [ ] Une visite demandée affiche une action `Confirmer`.
- [ ] Une visite confirmée peut être annulée ou replanifiée si la transition est autorisée.
- [ ] Une visite passée affiche `Marquer effectuée` quand applicable.
- [ ] Les types `in_person`, `virtual`, `self_guided`, `hybrid` ne sont jamais affichés bruts.
- [ ] Les compteurs d'onglets reflètent les données filtrées.
- [ ] Un owner ne peut pas accéder aux actions d'une visite hors portefeuille.

## Hors périmètre

- Création de liens Zoom/Meet.
- Paiement de visite.
- Refonte du calendrier unifié.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
