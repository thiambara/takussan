---
id: TCK-754
title: "Focus du marqueur de carte, nom de la visionneuse, entrée verrouillée au clavier"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-7--accessibilité-du-front-wcag-22-aa"
tags: [front, accessibilite, pistes]
---

## Contexte

Réf : **P07.10** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

- `.takussan-price-marker__pill:focus-visible` (`globals.css`) reprend le style du survol, à 1,22:1
  de l'état normal, avec `outline: none`.
- Le `Popup` de `PropertyLightbox` n'a pas de nom accessible.
- L'entrée cadenassée d'`AppSidebar` (`<span role="link" aria-disabled title>`) n'est pas
  focusable, et sa raison n'est que dans `title`.

## Décision du porteur

outline blanc de 2 px décalé sur le marqueur ; aria-label sur la visionneuse ; entrée verrouillée focusable, raison en sr-only

## Objectif utilisateur

Au clavier, on voit le marqueur qui a le focus ; un lecteur d'écran nomme la visionneuse, et
atteint l'entrée réservée aux comptes pro avec sa raison.

## Contraintes strictes

- **Hypothèse** : le nom de la visionneuse est « Photos : {title} » (`en` : « Photos: {title} »),
  clé `property.detail.gallery.viewerLabel` ; en `wo`, le texte français tel quel (wolof en pause).
- `title` reste sur l'entrée cadenassée, pour la souris.

## Delta à produire

- [ ] `globals.css` : règle `:focus-visible` du marqueur avec `outline: 2px solid #ffffff` et
      `outline-offset: 2px`.
- [ ] `PropertyLightbox` : `aria-label` sur `DialogPrimitive.Popup`.
- [ ] `AppSidebar` : `tabIndex={0}` sur l'entrée cadenassée, raison en `sr-only`.
- [ ] Tests.

## Critères d'acceptation

- [ ] AC1 — Le marqueur au focus déclare un contour blanc de 2 px, décalé de 2 px.
- [ ] AC2 — La visionneuse ouverte est un `dialog` nommé.
- [ ] AC3 — Chaque entrée cadenassée est focusable et porte sa raison dans son nom accessible.

## Hors périmètre

- Le parcours clavier du reste de la barre latérale.

## Notes d'implémentation

_(à remplir par implementing-specs)_
