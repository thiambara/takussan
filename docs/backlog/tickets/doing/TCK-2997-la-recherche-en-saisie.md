---
id: TCK-2997
title: La recherche s'arrête au haut du clavier
status: doing
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-22
updated: 2026-11-22
depends_on: [TCK-2988]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, clavier, recherche, adr-0133]
---

## Objectif utilisateur

Un visiteur qui cherche un quartier depuis son téléphone peut atteindre toutes les suggestions, sans qu'elles passent
sous le clavier ; un utilisateur de `/app` aussi, dans la palette « Aller à ».

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0133, amendement du 2026-11-22, § 9 et 10 : « Rechercher » reste (la saisie optimiste ne retire aucun geste).

## Delta

- `Navbar` (dialogue de la pastille, sous `lg`) et `PaletteDeCommandes` (sous `md`) : abonnés à la mesure pendant
  l'ouverture, calés sur la fenêtre visible en saisie.

## Critères d'acceptation

- [x] AC1 — En émulation 390 × 844 (clavier de 336 px) : le dialogue de recherche passe de 0-844 à 0-508 et la liste
      s'arrête à 508 ; avec un décalage de 150 px, 150-658 ; la palette, 0-508. Clavier fermé, tout revient.
- [x] AC2 — Focus sans clavier : rien ne bouge, « Rechercher » reste.
- [x] AC3 — Tests de classes (Navbar, palette), vérifiés par ablation.
- [ ] AC4 — Sur l'iPhone du porteur : en tapant « Alm » dans la recherche, la dernière suggestion se touche sans fermer
      le clavier.

## Reste sur dev

- **AC4** : la vérification sur l'iPhone du porteur (ADR-0133 : le téléphone juge la géométrie du clavier). Le
  code est fusionné ; le ticket passe `done` une fois le constat écrit ici.
