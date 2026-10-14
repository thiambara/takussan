---
id: TCK-644
title: Page « Mes biens » repensée pour le mobile
status: done
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

- [x] Mise en page mobile de l'en-tête, des compteurs, des filtres et des cartes
- [x] Le bouton flottant ne masque plus le contenu de la liste
- [x] Tests : filtres et tri toujours atteignables et appliqués

## Critères d'acceptation

- [x] AC1 — À 390 × 844, au moins une carte de bien est visible au premier écran
- [x] AC2 — Tous les filtres et tris d'avant restent atteignables et produisent la même requête
- [x] AC3 — Le titre d'une carte n'est pas tronqué sur une ligne unique illisible (deux lignes au moins)
- [x] AC4 — Le dernier élément de la liste peut défiler au-dessus du bouton flottant
- [x] AC5 — Aucune barre de défilement horizontale à 360 px ; ordinateur inchangé

## Hors périmètre

- La fiche détaillée d'un bien et le formulaire
- Le contenu des filtres avancés

## Notes d'implémentation

- Le bouton flottant reste libellé « Messagerie » (décision TCK-565, gardée par `ChatWidget.test.tsx`) : la place est réservée par le contenu (`RESERVE_SOUS_LANCEUR`, `components/chat-widget/reserve.ts`, module sans `'use client'`). La réserve vit dans la page et non dans `AppShell` : la messagerie compense exactement les marges de la coque.
- La barre d'actions groupées prend un créneau du FloatingDock : elle passait sous le lanceur depuis toujours, mobile et ordinateur.
- Feuille de filtres et barre d'ordinateur partagent `CriteresAvances` et les mêmes `updateParam(s)` ; le test AC2 compare les URL produites par les deux chemins.
- Relevé au navigateur : sans colonne déclarée, la grille des cartes se dimensionnait au contenu (498 px à 390) → `grid-cols-1`. Après : carte de 358 px, première carte entière au premier écran (bas à 453 px sur 844), `scrollWidth = innerWidth` à 360.
