---
id: TCK-550
title: "Aucun sélecteur de langue n'est atteignable sur mobile : FR / EN / WO n'existent que dans la barre de bureau"
status: todo
phase: P1
family: bug
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models: []
tags: [front, mobile, i18n, navbar, footer]
---

## Objectif utilisateur

Sur téléphone, un visiteur qui arrive sur le site dans une langue qu'il ne lit pas passe en
français, anglais ou wolof en deux gestes, depuis n'importe quelle page publique.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constat N3). `LanguageSwitcher` n'est rendu que dans le bloc
d'actions `hidden lg:flex` de `Navbar` ; ni le menu mobile ni le pied de page ne le proposent.
Mesuré à 390 et 360 px : le seul « FR » du DOM est invisible (`offsetParent === null`).
TCK-159 (`done`) a câblé le sélecteur public, mais ses critères ne portaient que sur la barre de
bureau. Un visiteur qui suit un lien partagé vers `/fr/…` reste donc en français, alors que la
sélection de la langue est une fonctionnalité P0.

## Contrat de données

Aucun endpoint. Le changement de langue suit le mécanisme existant (préfixe d'URL puis cookie,
ADR-0026 §5) ; pour un utilisateur connecté, la préférence suit le chemin déjà en place.

## Direction UX / Artistique

- Dans le menu mobile : un contrôle segmenté **FR · EN · WO**, visible sans défilement, la langue
  courante marquée. Pas une liste déroulante.
- Dans le pied de page : le même choix, pour qui ne passe jamais par le menu.
- Les libellés des langues restent dans leur propre langue (« Wolof », pas « Wolof (langue) »).

## Contraintes strictes (métier)

- Changer de langue conserve le chemin et la requête courants (`/fr/properties?type=villa` →
  `/wo/properties?type=villa`).
- L'état sélectionné est annoncé aux technologies d'assistance (`aria-current` ou équivalent).

## Delta à produire

- [ ] Choix de langue dans le menu mobile de `Navbar`.
- [ ] Choix de langue dans le pied de page public.
- [ ] Test : le choix est présent et visible sous `lg` ; changer de langue conserve chemin et requête.

## Critères d'acceptation

- [ ] AC1 — à 360 × 740, menu ouvert, trois contrôles FR, EN, WO sont visibles (boîte non nulle,
      dans le viewport sans défilement du panneau), avec au moins 44 px de hauteur de zone tactile.
- [ ] AC2 — depuis `/fr/properties?type=villa&page=2`, choisir WO mène à
      `/wo/properties?type=villa&page=2`, textes affichés en wolof.
- [ ] AC3 — le pied de page porte le même choix, visible à 360 px.
- [ ] AC4 — la langue courante est la seule marquée comme sélectionnée, dans les deux emplacements.

## Hors périmètre

- La traduction de contenus manquants en `wo` (dettes i18n distinctes).
- Le sélecteur de la barre de bureau, inchangé.

## Notes d'implémentation

_(à remplir par implementing-specs)_
