---
id: TCK-2494
title: En-tête public de bureau sur une ligne, et menu « Mon espace » du profil connecté
status: todo
phase: P1
family: front
estimate: M
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: [TCK-2493]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, navigation, desktop, adr-0091, audit-ux]
---

## Objectif utilisateur

En bureau, le visiteur atteint Agences sans descendre au pied de page, et le connecté retrouve son espace (loyer, visites, demandes, messages) depuis n'importe quelle page publique.

## Contrat de données

Aucun endpoint neuf : lignes et compteurs du menu « Mon espace » = destinations et compteurs du persona actif (ADR-0089), comme la barre de TCK-2493.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=navigation&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes), vues Bureau des écrans « Anonyme », « Locataire », « Agent » et « Par profil » (trois menus côte à côte).
- Une seule ligne : marque, Louer · Acheter · Agences, recherche, favoris, compte, « Publier un bien ».
- La rangée de catégories ne reste que sur les pages de découverte (accueil, liste) ; elle quitte la fiche et les pages d'outils.
- Connecté : bouton « Mon espace » avec avatar et point de notification ; le menu montre les lignes du persona avec un détail et un compteur, puis « Ouvrir mon espace », la langue et la déconnexion.

## Contraintes strictes (métier)

- Le menu ne propose jamais une destination que le persona ne peut pas ouvrir (même composition que `/app`).
- « Publier un bien » reste dans l'en-tête pour les pros, et aussi en tête de leur menu (décision du porteur, 2026-11-08).

## Delta à produire

- [ ] En-tête public de bureau sur une ligne, Agences dans la navigation.
- [ ] Rangée de catégories limitée aux pages de découverte.
- [ ] Menu « Mon espace » dérivé du persona, avec compteurs.
- [ ] Tests : lignes du menu par persona ; rangée absente sur la fiche.

## Critères d'acceptation

- [ ] AC1 — À 1440 px, Agences est dans l'en-tête de chaque page publique de découverte.
- [ ] AC2 — Un locataire connecté ouvre « Mon espace » et voit Loyer (avec le montant dû), Interventions, Mon bail, Documents, Messages ; un agent voit Demandes, Visites, Clients, Agenda, Mes biens.
- [ ] AC3 — La fiche d'un bien n'a plus la rangée de catégories.
- [ ] AC4 — Aucun débordement horizontal de l'en-tête entre 1024 et 1440 px.

## Hors périmètre

- La barre d'onglets mobile (TCK-2493).
- La recherche dans l'en-tête (TCK-2497).

## Notes d'implémentation

_(à remplir par implementing-specs)_
