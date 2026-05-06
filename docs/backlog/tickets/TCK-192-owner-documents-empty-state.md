---
id: TCK-192
title: Documents owner — état vide actionnable
status: todo
phase: P2
family: front
estimate: S
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-062]
blocks: []
spec_refs:
  features:
    - docs/features.md#110-documents--contrats
  models:
    - docs/models-spec.md#22-document-
    - docs/models-spec.md#3-property
    - docs/models-spec.md#14-lease-
tags: [front, owner, documents, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire sans documents visibles doit savoir quoi ajouter et où rattacher chaque fichier.

## Contrat de données

La bibliothèque documents gère les documents polymorphes liés aux biens, baux, clients, réservations et utilisateurs/agences. L'état vide owner doit guider vers les catégories et entités prévues sans inventer de nouveau modèle.

## Direction UX / Artistique

État vide utile et compact : exemples de catégories, CTA upload, rappel des entités rattachables, aucun faux document ni donnée de démonstration.

## Contraintes strictes (métier)

- Ne pas afficher de documents fictifs.
- Les uploads restent limités aux entités autorisées pour l'owner.
- Les catégories proposées doivent correspondre aux types déjà supportés par la bibliothèque.

## Delta à produire

- [ ] État vide `/app/documents` spécifique owner avec exemples : titre foncier, bail, quittance, devis, pièce propriétaire.
- [ ] CTA `Téléverser un document` qui préserve le workflow existant.
- [ ] Aide au choix de l'entité de rattachement quand l'owner a des biens/baux.
- [ ] Tests frontend de l'état vide owner.

## Critères d'acceptation

- [ ] Un owner avec 0 document voit un état vide orienté propriétaire.
- [ ] L'état vide propose des catégories pertinentes sans créer de données.
- [ ] Le CTA upload ouvre le flux document existant.
- [ ] Les entités proposées respectent le scope owner.

## Hors périmètre

- OCR.
- Signature électronique.
- Génération de nouveaux PDF.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
