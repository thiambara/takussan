---
id: TCK-843
title: "Le sr-only de l'entrée verrouillée allonge le document : la coque de /app défile"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, layout, regression]
---

## Contexte

Relevé par le porteur sur `preview.takussan.com/app/profile` le 2026-10-18 : arrivé en bas de la
page, ce n'est plus le `<main>` qui défile mais le document entier — barre haute et barre latérale
comprises —, et une bande vide apparaît sous la barre latérale.

Régression de TCK-754 (`719cd7636`) : l'entrée cadenassée d'`AppSidebar` porte désormais un
`<span className="sr-only">`, donc `position: absolute`. Aucun ancêtre n'est positionné entre lui
et `<html>` : son bloc conteneur est la fenêtre, et ni l'`overflow-y-auto` du `<nav>` ni
l'`overflow-hidden` de la coque `h-dvh` ne le coupent. Posé à sa place statique, en bas de la liste
de la barre, il étend la zone de défilement du document au-delà du viewport (TCK-503 garantissait
le contraire). Seuls les admins d'agence `individual` — ceux qui voient des cadenas — sont touchés.

## Objectif utilisateur

Dans `/app`, seul le contenu défile ; la barre haute et la barre latérale restent en place.

## Delta à produire

- [x] `AppSidebar` : `relative` sur le `<nav>` qui défile — bloc conteneur de tout élément absolu
      de la liste, présent ou futur, comme le `<main>` l'est déjà pour le contenu.
- [x] Test.

## Critères d'acceptation

- [x] AC1 — Le `<nav>` qui défile de la barre latérale est positionné, et contient les `sr-only`
      des entrées cadenassées.

## Notes d'implémentation

- **Ablation** : test neuf rouge avant le correctif (`relative` absent de la classe du `<nav>`),
  vert après.
- **Mécanisme mesuré** dans Chrome sans interface, sur une reproduction minimale de la coque
  (colonne `100vh`, conteneur `overflow: hidden`, `<nav>` `overflow-y: auto` long, un `sr-only`
  en bas) : `<nav>` statique → `scrollHeight` 1661 pour un viewport de 513 ; `<nav>` `relative` →
  513 / 513.
- jsdom ne mesure aucune mise en page : le test garde la cause (le `<nav>` positionné), pas le
  symptôme.
