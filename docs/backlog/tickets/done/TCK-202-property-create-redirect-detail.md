---
id: TCK-202
title: "Création bien — rediriger vers la fiche créée"
status: done
phase: P1
family: front
estimate: S
wave: 22
created: 2026-05-06
updated: 2026-05-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models:
    - docs/models-spec.md#3-property
tags: [front, properties, creation, agent-immobilier, smoke-test-2026-05-06]
---

## Objectif utilisateur

Après avoir créé un bien, l'agent arrive directement sur la fiche pour compléter médias, adresse, statut et publication.

## Contrat de données

La création retourne l'identifiant et/ou la référence du Property créé. Le frontend doit utiliser cette réponse pour naviguer vers `/app/properties/{id}`.

## Direction UX / Artistique

Flux continu : création réussie, confirmation courte, puis fiche détail prête à compléter. Éviter de renvoyer l'agent vers une liste où il doit retrouver son bien.

## Contraintes strictes (métier)

- Ne pas naviguer vers une fiche tant que la création n'a pas confirmé l'id serveur.
- En cas d'échec, conserver les champs saisis et afficher l'erreur.
- Les deux actions de création disponibles doivent avoir un comportement cohérent.

## Delta à produire

- [ ] Modifier le flow post-création pour naviguer vers la fiche créée.
- [ ] Afficher un feedback de succès court après création.
- [ ] Vérifier la cohérence entre `Enregistrer en brouillon` et `Soumettre à publication`.
- [ ] Ajouter test de soumission réussie vérifiant la navigation vers `/app/properties/{id}`.

## Critères d'acceptation

- [ ] Créer un brouillon depuis `/app/properties/new` redirige vers `/app/properties/{id}`.
- [ ] La fiche affiche la référence générée `TK-*`.
- [ ] Une erreur de création laisse l'agent sur le formulaire avec ses données.

## Hors périmètre

- Refonte des champs du formulaire.
- Publication et transitions de statut.
- Upload média.

## Notes d'implémentation

The create form now reads the clicked submit intent from a ref so draft and publication submissions cannot race React state before submit.
