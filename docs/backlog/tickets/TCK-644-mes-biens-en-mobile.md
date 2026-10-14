---
id: TCK-644
title: Page « Mes biens » repensée pour le mobile
status: doing
phase: P1
family: front
estimate: M
wave: 77
created: 2026-10-14
updated: 2026-10-14
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  models: []
tags: [front, biens, mobile, design, responsive]
---

## Objectif utilisateur

Sur son téléphone, l'annonceur voit ses biens dès le premier écran et agit dessus sans lutter avec
la mise en page.

## Contrat de données

- Inchangé : la page lit la même liste, les mêmes compteurs et les mêmes filtres.

## Direction UX / Artistique

- Relevé du porteur du 2026-10-14 (capture à 390 px) : quatre compteurs en grille 2×2 et un bloc
  de filtres occupent tout le premier écran ; le titre et la référence des cartes sont coupés ; le
  bouton flottant « Messagerie » recouvre les cartes.
- Intention : sensation d'application — compteurs compacts, recherche visible, filtres secondaires
  regroupés, cartes lisibles au pouce, « Publier un bien » accessible sans prendre la tête de page.
- L'affichage ordinateur ne régresse pas.

## Contraintes strictes (métier)

- Aucun filtre, tri, ni action existante ne disparaît : ils changent de place, pas d'existence.
- Les filtres restent appliqués côté serveur (`filter[…]`).
- La sélection multiple et ses actions restent possibles.

## Delta à produire

- [ ] Mise en page mobile de l'en-tête, des compteurs, des filtres et des cartes
- [ ] Le bouton flottant ne masque plus le contenu de la liste
- [ ] Tests : filtres et tri toujours atteignables et appliqués

## Critères d'acceptation

- [ ] AC1 — À 390 × 844, au moins une carte de bien est visible au premier écran
- [ ] AC2 — Tous les filtres et tris d'avant restent atteignables et produisent la même requête
- [ ] AC3 — Le titre d'une carte n'est pas tronqué sur une ligne unique illisible (deux lignes au moins)
- [ ] AC4 — Le dernier élément de la liste peut défiler au-dessus du bouton flottant
- [ ] AC5 — Aucune barre de défilement horizontale à 360 px ; ordinateur inchangé

## Hors périmètre

- La fiche détaillée d'un bien et le formulaire
- Le contenu des filtres avancés

## Notes d'implémentation

_(à remplir par implementing-specs)_
