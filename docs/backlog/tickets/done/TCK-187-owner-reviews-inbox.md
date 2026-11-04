---
id: TCK-187
title: Avis owner — boîte des avis reçus
status: done
phase: P2
family: front
estimate: M
wave: 20
created: 2026-05-06
updated: 2026-05-06
depends_on: [TCK-033, TCK-073]
blocks: []
spec_refs:
  features:
    - docs/features.md#111-avis--réputation
  models:
    - docs/models-spec.md#11-review
    - docs/models-spec.md#3-property
tags: [front, owner, reviews, smoke-test-2026-05-06]
---

## Objectif utilisateur

Un propriétaire doit pouvoir consulter les avis reçus sur ses biens, répondre publiquement et signaler un avis inapproprié.

## Contrat de données

Les avis sont polymorphes et rattachés aux entités reviewables. L'écran owner doit lister les avis dont le sujet appartient à son portefeuille, avec auteur, note, statut, réponse éventuelle et compteur de signalements.

## Direction UX / Artistique

Boîte de réception sobre : filtres par bien/statut/répondu/non répondu, cartes compactes d'avis, réponse inline sous contrôle, signalement avec confirmation et motif.

## Contraintes strictes (métier)

- La vue owner ne doit pas afficher le parcours customer `Laisser un avis`.
- Répondre est réservé au propriétaire/gestionnaire autorisé du bien.
- Signaler un avis déclenche le workflow de modération existant.
- Les avis non approuvés doivent être présentés selon les règles de visibilité définies par le backend.

## Delta à produire

- [ ] Adapter `/app/profile/reviews` au rôle actif : owner = avis reçus, customer = avis à laisser/mes avis.
- [ ] Liste owner : avis reçus avec bien, note, auteur, date, statut, réponse.
- [ ] Action `Répondre` / modifier réponse si autorisée.
- [ ] Action `Signaler` avec motif.
- [ ] Filtres : bien, statut, répondu/non répondu.
- [ ] État vide owner spécifique.
- [ ] Tests frontend par rôle : owner ne voit pas `Laisser un avis`, customer conserve son parcours.

## Critères d'acceptation

- [ ] Un owner ouvre `/app/profile/reviews` et voit les avis reçus sur ses biens.
- [ ] Aucun CTA `Laisser un avis` n'est affiché au propriétaire dans cette vue.
- [ ] Un avis sans réponse affiche une action `Répondre`.
- [ ] Une réponse publiée est visible sous l'avis.
- [ ] L'action `Signaler` demande un motif et confirme la prise en compte.
- [ ] Un owner ne voit pas les avis d'un bien hors portefeuille.

## Hors périmètre

- Modération admin globale.
- Détection automatique d'avis suspects.
- Badges de réputation.

## Notes d'implémentation

La boîte owner agrège les avis approuvés via les endpoints par bien, car l'index global reste réservé à la modération/admin.
