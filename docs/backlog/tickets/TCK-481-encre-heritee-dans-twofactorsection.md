---
id: TCK-481
title: "`TwoFactorSection` hérite l'encre de son conteneur : 3,94:1, seconde occurrence du motif de TCK-471"
status: todo
phase: P2
family: front
estimate: S
wave: 53
created: 2026-08-30
updated: 2026-08-30
depends_on: [TCK-471]
blocks: []
spec_refs:
  features:
    - docs/features.md
tags: [front, accessibilite, contraste, dette]
---

## Objectif utilisateur

L'écran de sécurité du compte doit se lire. Son texte est aujourd'hui sous le seuil AA, pour la
même raison mécanique que le bouton invisible de la fiche agence.

## Le défaut

`takussan-web/src/components/profile/security/TwoFactorSection.tsx:212` — **3,94:1**, mesuré le
2026-08-30 par `scripts/check-heritage-encre.mjs` à sa mise en service.

C'est le motif de TCK-471 : un conteneur qui pose `bg-foreground text-background` **retourne deux
propriétés, il ne retourne pas les jetons**, et tout descendant qui tire son fond d'une variante
continue de lire la palette claire.

⚠ **Le ticket TCK-471 affirmait qu'il n'y avait qu'un seul conteneur concerné, et il le disait sur
un relevé.** Le relevé cherchait la chaîne `bg-foreground` et concluait « un seul conteneur ».
La garde, elle, cherche le **motif** — et en a trouvé un second le jour où elle a tourné.
*Une chaîne n'est pas un motif ; un relevé qui cherche l'une ne trouve jamais l'autre.*

## Pourquoi ce n'est pas 1,00:1 comme la fiche agence

Le descendant n'est pas ici un bouton `outline` : le couple rendu est moins violent, donc le
défaut est **lisible mais insuffisant** plutôt qu'invisible. C'est ce qui l'a fait tolérer sous
cliquet à sens unique par TCK-471 plutôt que corriger dans son lot — et c'est aussi ce qui le rend
plus durable, puisque personne ne le signalera spontanément.

## Contrat de données

Aucun.

## Delta à produire

- [ ] Appliquer la forme tranchée par TCK-471 — la classe `dark`, qui bascule les jetons pour tout
      le sous-arbre — ou dire pourquoi cet écran demande autre chose.
- [ ] Retirer l'entrée du cliquet de `scripts/check-heritage-encre.mjs` **dans le même diff** : le
      cliquet est à sens unique, une entrée corrigée qui y reste est une tolérance qui ne
      correspond plus à rien.

## Critères d'acceptation

- [ ] **AC1** — le contraste du texte concerné atteint **≥ 4,5:1** en thème clair, mesuré par
      calcul sur les couleurs RENDUES.
- [ ] **AC2** — les autres textes de la même section sont mesurés, pas seulement celui-là : *un
      correctif qui réparerait l'un en cassant l'autre passerait un contrôle qui n'en regarde
      qu'un* (AC2 de TCK-471, qui a servi).
- [ ] **AC3** — `node scripts/check-heritage-encre.mjs` reste vert **avec une entrée de moins** au
      cliquet, et rougit si l'entrée est réintroduite sans le défaut.
- [ ] **AC4** — ablation : rétablir le couple d'origine fait rougir AC1 et la garde, changement
      prouvé par `md5` **avant** lecture du résultat.

## Hors périmètre

- Le jeton `--destructive`, qui a son propre ticket (TCK-480).
- Les autres entrées du cliquet, qui n'ont pas été mesurées ici.

## Notes d'implémentation

Trouvé par `scripts/check-heritage-encre.mjs` (TCK-471) le jour de sa mise en service — comme la
classe morte de TCK-453 l'avait été par la sienne. *Une garde neuve rapporte le plus à sa première
exécution : c'est le seul moment où elle regarde un parc que personne n'a écrit en pensant à elle.*
