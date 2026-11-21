---
id: TCK-2990
title: Au téléphone, l'en-tête et la barre d'onglets de /app s'effacent au défilement
status: todo
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: [TCK-2989]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, coque, animation, adr-0134]
---

## Objectif utilisateur

En lisant une liste sur son téléphone, l'utilisateur voit le contenu sur toute la hauteur : l'en-tête et la
barre d'onglets partent quand il descend, reviennent quand il remonte ou touche la pastille.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0134 § 3, la mécanique de la maquette « L'écran économe » validée par le porteur (v4 de l'animation : départ
et retour doux, d'un seul bloc, départ automatique après 2,5 s).

## Contraintes strictes (métier)

- Jamais effacées : en haut ni en bas de page, tiroir ouvert, barre d'action ou de sélection présente, focus
  dans une barre.
- Mouvement réduit : un fondu, sans déplacement.
- La pastille est un bouton nommé (fr, en, wo — le `wo` porte le français).
- Clavier ouvert : la barre d'onglets part (ADR-0133).

## Delta à produire

- [ ] `useEffacementDesBarres` : seuils 40 / 24 px, départ automatique, doigt sur la barre, route qui change
- [ ] `data-barres-effacees` sur `<html>`, le mouvement dans `globals.css`, `--haut-colle` qui suit
- [ ] La pastille de rappel
- [ ] Tests du crochet et de la coque, par ablation

## Critères d'acceptation

- [ ] AC1 — 40 px de défilement vers le bas effacent les deux barres ; 24 px vers le haut les rappellent.
- [ ] AC2 — Rappelées, elles repartent 2,5 s après le dernier défilement, jamais en haut ni en bas de page.
- [ ] AC3 — Les éléments collés d'une page suivent l'en-tête (56 → 0 px).
- [ ] AC4 — La pastille n'existe à l'écran que barres effacées ; la toucher les rappelle.
- [ ] AC5 — Sur l'iPhone du porteur : le mouvement est celui de la maquette.
