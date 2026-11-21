---
id: TCK-2990
title: Au téléphone, l'en-tête et la barre d'onglets de /app s'effacent au défilement
status: doing
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

- [x] `useEffacementDesBarres` : seuils 40 / 24 px, départ automatique, doigt sur la barre, route qui change
- [x] `data-barres-effacees` sur `<html>`, le mouvement dans `globals.css`, `--haut-colle` qui suit
- [x] La pastille de rappel
- [x] Tests du crochet et de la coque, par ablation

## Critères d'acceptation

- [x] AC1 — 40 px de défilement vers le bas effacent les deux barres ; 24 px vers le haut les rappellent.
- [x] AC2 — Rappelées, elles repartent 2,5 s après le dernier défilement, jamais en haut ni en bas de page.
- [x] AC3 — Les éléments collés d'une page suivent l'en-tête (56 → 0 px).
- [x] AC4 — La pastille n'existe à l'écran que barres effacées ; la toucher les rappelle.
- [ ] AC5 — Sur l'iPhone du porteur : le mouvement est celui de la maquette.

## Relevé (2026-11-21, 390 × 844 en émulation, `/app/payments`)

80 px vers le bas : en-tête à -56, barre à 844, onglets des loyers à 0, pastille visible. 40 px vers le haut :
tout revient (en-tête 0, barre 780, onglets 56). 2,7 s de repos : les barres repartent. Pastille touchée : elles
reviennent. En haut de page : elles restent. Tests du crochet et des règles vérifiés par ablation (11 mutants, tous
rouges).

En passant : `primitives-neuves-tck-2689` cherchait une règle par une expression à retour arrière exponentiel
(`(?:\s*[^{}@]+\{[^{}]*\})*`), qui dépassait 20 s dès que la feuille gagnait des blocs ; rendue linéaire, même
garde (vérifiée par ablation).

## Retour du porteur (2026-11-21, iPhone)

1. « Le point ne marche pas quand je remonte et m'arrête, ça ne part pas au bout de 2,5 s » — reproduit : à la
   fermeture du tiroir (ou d'une feuille, de la palette), base-ui ramène le focus sur le bouton qui l'a ouvert,
   dans la barre ; le crochet le prenait pour une navigation au clavier et retenait les barres pour toujours.
   Corrigé : seul un focus `:focus-visible` retient ; un défilement relâche un doigt posé sur une barre ;
   retenues à l'échéance, le compte reprend. Trois tests, chacun vérifié par ablation.
2. « La même chose sur la partie publique où on affiche la barre du bas » — ADR-0134 § 4 : la barre publique
   monte le crochet et la pastille ; la `Navbar` ou l'en-tête de page monte, la barre descend, les puces de la
   liste suivent. Relevé en émulation sur `/fr/properties` : `Navbar` à -69, barre à 844, retour au défilement
   vers le haut, départ après 2,5 s.

