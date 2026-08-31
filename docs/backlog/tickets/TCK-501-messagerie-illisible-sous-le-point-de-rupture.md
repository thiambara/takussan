---
id: TCK-501
title: "Messagerie pleine page — deux panneaux fixes sur un écran de téléphone"
status: todo
phase: P2
family: bug
estimate: S
wave: 57
created: 2026-08-31
updated: 2026-08-31
depends_on: [TCK-500]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
tags: [front, bug, messaging, responsive]
---

## Objectif utilisateur

Un utilisateur qui ouvre sa messagerie depuis un téléphone doit pouvoir lire ses conversations et
écrire dedans.

## Contrat de données

Aucun changement d'API. Le défaut est entièrement de mise en page.

## Direction UX / Artistique

Sous le point de rupture `md`, la messagerie montre **une chose à la fois** : la liste des
conversations, ou la conversation ouverte — avec un retour vers la liste. C'est le partage
habituel d'une boîte de réception sur téléphone, et c'est déjà celui que la vue compacte du
panneau flottant applique.

Au-dessus, rien ne change : les deux panneaux côte à côte restent le bon écran.

## Contraintes strictes (métier)

1. Un utilisateur entré sur une conversation depuis un lien (`?conversation=`, `?property=`) doit
   pouvoir **revenir à la liste** ; sans quoi le lien mène à un cul-de-sac.
2. La hauteur ne peut pas rester `calc(100vh - 12rem)` sur un téléphone, où la barre d'adresse
   mobile fait varier `100vh`.

## Delta à produire

- [ ] Mise en page de la messagerie pleine page : une seule colonne sous le point de rupture,
      deux au-dessus.
- [ ] Retour vers la liste depuis une conversation, visible uniquement sous le point de rupture.
- [ ] Tests : la liste et la conversation ne sont pas rendues ensemble sous le point de rupture ;
      le retour ramène à la liste.

## Critères d'acceptation

- [ ] AC1 — à 390 px de large, `/app/messages` sans conversation choisie montre la **liste seule**,
      pleine largeur, sans défilement horizontal.
- [ ] AC2 — à 390 px, une conversation ouverte occupe **toute** la largeur : aucun mot du fil ni du
      composeur ne se coupe en colonne d'un mot par ligne.
- [ ] AC3 — à 390 px, depuis une conversation ouverte par `?property=` ou `?conversation=`, un
      retour ramène à la liste.
- [ ] AC4 — à 1440 px, l'écran est **inchangé** : liste 320 px à gauche, conversation à droite.
- [ ] AC5 — le test rougit si la classe responsive est retirée (ablation).

## Hors périmètre

- Le panneau flottant, qui ne s'affiche pas sous le point de rupture par construction.
- Toute évolution fonctionnelle de la messagerie.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
