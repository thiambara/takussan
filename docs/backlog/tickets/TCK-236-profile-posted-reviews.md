---
id: TCK-236
title: "Profil — afficher les avis postés"
status: done
phase: P2
family: bug
estimate: M
created: 2026-05-08
updated: 2026-05-08
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#11-review
tags: [front, back, reviews, profile, smoke-test-2026-05-08]
---

## Objectif utilisateur

Un utilisateur doit retrouver dans son profil les avis qu'il a déjà publiés, avec leur état.

## Contrat de données

Finding smoke `docs/smoke-tests/utilisateurs-authentifies-2026-05-08.md` : `TC-AUTH-46` affiche des séjours ou baux éligibles avec CTA, mais pas la liste des avis postés attendue.

## Direction UX / Artistique

La page doit distinguer clairement les avis publiés des opportunités de déposer un avis, avec une liste dense et scannable.

## Contraintes strictes (métier)

- La liste des avis postés est limitée à l'utilisateur courant.
- Les statuts de modération doivent être visibles sans exposer les actions réservées aux modérateurs.
- Les opportunités de laisser un avis ne doivent pas remplacer la liste principale.

## Delta à produire

- [ ] Câbler la lecture des avis rédigés par l'utilisateur courant.
- [ ] Afficher note, contenu/titre, date, cible et statut.
- [ ] Conserver les CTA d'éligibilité dans une section secondaire si nécessaire.
- [ ] Ajouter des tests front ou API pour un utilisateur avec et sans avis posté.

## Critères d'acceptation

- [ ] `/app/profile/reviews` liste les avis déjà postés par l'utilisateur courant.
- [ ] Chaque avis affiche au minimum note, texte ou titre, date et statut.
- [ ] Un utilisateur sans avis voit un état vide localisé.
- [ ] Les CTA `Laisser un avis` ne remplacent pas la liste des avis postés.

## Hors périmètre

- Modération admin des avis.
- Réponse publique propriétaire/agence.
- Edition d'un avis déjà publié si aucune route dédiée n'existe.

## Notes d'implémentation

- La section principale consomme `GET /api/reviews?filter[author_id]=me`; les opportunités `Laisser un avis` restent séparées pour ne plus remplacer les avis déjà postés.
