---
id: TCK-2615
title: "Plus de modale de bienvenue par-dessus un écran plein, après un assistant ou après une publication"
status: todo
phase: P1
family: front
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
tags: [front, onboarding, modal, audit-ux, app]
---

## Objectif utilisateur

La personne qui vient de finir un assistant, de publier son annonce ou qui remplit un écran plein (la création d'un bien) arrive sur ce qu'elle a fait — pas sous une fenêtre « Bienvenue » qui lui réexplique l'espace qu'elle vient de traverser.

## Contrat de données

Aucun changement d'API. Re-mesure sur `dev` (1bce3798a) : la coque de `/app` monte les modales de bienvenue selon les rôles (client, bailleur, agent, agence standard), sur toutes les routes de `/app`, y compris l'écran plein `/app/properties/new` (`ROUTES_PLEIN_ECRAN`) et la première arrivée après un assistant d'invité ; leur fermeture est mémorisée.

## Direction UX / Artistique

- Décision 4 b de l'audit (README, famille 2) : **aucune modale à l'arrivée d'un parcours**. Ce qu'elles expliquaient vit en place, dans « Démarrer » et dans les bulles posées sur l'écran (4 a, porté par la famille 3).
- Rien de neuf à dessiner : la règle retire, elle n'ajoute pas.

## Contraintes strictes (métier)

- La modale ne s'affiche **jamais** : sur une route de la liste des écrans pleins ; à la première arrivée qui suit la fin d'un assistant (bailleur, agent, prestataire, administrateur, hôte) ; à l'arrivée qui suit une publication (TCK-2602).
- Hors de ces cas, le comportement d'aujourd'hui reste tant que la famille 3 n'a pas livré les bulles en place : même condition d'affichage, même mémorisation de la fermeture. **Pas de régression** : une personne qui n'a jamais vu la modale et qui arrive par la porte ordinaire la voit encore.
- Une modale évitée par cette règle n'est pas marquée « vue » : elle reste disponible pour la prochaine arrivée ordinaire.

## Delta à produire

- [ ] Règle d'affichage : écrans pleins, sortie d'assistant, sortie de publication exclus.
- [ ] Tests : `/app/properties/new` → aucune modale ; arrivée marquée « sortie d'assistant » → aucune modale, et la suivante arrivée ordinaire la montre ; arrivée ordinaire d'un nouveau bailleur → la modale, comme aujourd'hui.

## Critères d'acceptation

- [ ] AC1 — Un bailleur qui termine l'assistant d'invité arrive sur `/app` sans `role="dialog"` dans le DOM (sur `dev` : la modale bailleur s'ouvre).
- [ ] AC2 — Sur `/app/properties/new`, aucune modale de bienvenue n'est rendue, quel que soit le rôle.
- [ ] AC3 — Un compte bailleur qui n'a jamais vu la modale et ouvre `/app` par la porte ordinaire la voit encore.

## Hors périmètre

- Les bulles en place et le retrait complet des modales (famille 3, décision 4 a).
- Le contenu de « Démarrer » (TCK-2612, TCK-2614, famille 3).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
