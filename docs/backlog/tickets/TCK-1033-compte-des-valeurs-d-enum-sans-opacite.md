---
id: TCK-1033
title: "Le compte « N valeurs » de l'énumération sélectionnée retrouve son contraste (encre pleine)"
status: todo
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-68--passage-axe-au-navigateur-des-écrans-connectés-app-console-super-admin"
tags: [web, a11y, contraste, super-admin, pistes]
---

## Contexte

Réf : **P68.07** du fichier de pistes, `validé (délégué)` (critère V7 accordé). Sur
`/super-admin/enums`, l'entrée sélectionnée de la liste est un `Button` plein (`bg-primary
text-primary-foreground`) ; son compte « N valeurs » y ajoute `opacity-75`, ce qui ramène l'encre
à 3,59:1 sur `--primary` (mesuré par le test ci-dessous avant correctif), sous le seuil AA de
4,5:1. L'encre pleine du bouton donne 5,06:1.

## Décision du porteur (déléguée)

> retirer l'`opacity-75` du compte « N valeurs » de `business-enums.tsx:46`, qui garde l'encre `primary-foreground` pleine du bouton sélectionné (5,06:1), sans texte neuf

## Reste à faire

> le couple de jetons des pastilles « Console » de `SuperAdminTopbar.tsx` et de visibilité publique de `PropertyList.tsx`, au porteur

## Objectif

Le compte de valeurs de l'entrée sélectionnée passe 4,5:1, sans couleur ni texte neuf.

## Delta à produire

- [ ] `business-enums.tsx` (`EnumList`) : retirer `opacity-75` du compte de valeurs.
- [ ] Test : `src/components/admin/super/__tests__/business-enums.contraste.test.tsx`, qui compose
      l'encre rendue (alpha et opacité des ancêtres compris) sur le fond du bouton sélectionné et
      exige 4,5:1.

## Critères d'acceptation

- [ ] AC1 — Le compte « N valeurs » de l'entrée sélectionnée rend au moins 4,5:1 sur `--primary`
      dans le thème clair.
- [ ] AC2 — Aucun texte ni jeton neuf.

## Hypothèses (mode sans humain)

- L'entrée non sélectionnée (`ghost`, encre `foreground`) perd aussi son atténuation : la
  précision du porteur vise la classe, commune aux deux états, et l'encre pleine y passe a fortiori.
- Le thème sombre n'est pas posé sur `/super-admin/enums` ; la mesure se fait sur les jetons clairs.

## Hors périmètre

- Les pastilles « Console » et de visibilité publique (reste ci-dessus, au porteur).

## Notes d'implémentation

_(à remplir par implementing-specs)_
