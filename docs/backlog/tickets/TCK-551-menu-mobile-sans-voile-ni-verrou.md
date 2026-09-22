---
id: TCK-551
title: "Menu mobile : sans voile ni verrou de défilement, fermeture impossible d'un tap à côté, rangée de catégories à moitié cachée, alignements décalés"
status: todo
phase: P2
family: front
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, navbar, a11y, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur ouvre le menu, comprend qu'il est dans un panneau au-dessus de la page,
le ferme comme il l'attend (tap à côté, geste retour, croix), et n'y trouve que de la navigation.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats N5 à N8), mesuré à 390 × 844 et 360 × 740.

- **N5** — le panneau n'est pas modal : aucun voile, `body` reste en `overflow: visible` (la page
  défile dessous), un tap hors du panneau ne le ferme pas (`handleClickOutside` ne traite que les
  menus « Plus » et utilisateur), et le focus en sort. Les cartes de résultats restent visibles
  sous le bouton « Publier une annonce ».
- **N6** — la rangée de catégories du menu mesure 521 px dans 342 px visibles : « Commerce » et
  « Bureau » sont hors champ, sans fondu ni barre de défilement pour le signaler, et les dix autres
  types ne sont pas atteignables d'ici. Le tiroir de filtres les propose tous.
- **N7** — la barre est en `px-6` sous `lg` (logo à x = 24) quand le contenu de la page est en
  `px-4` (x = 16). Dans le menu, le texte de « Connexion » est à x = 35 contre 24 pour les autres
  liens : la classe `px-0` passée à `buttonVariants` perd contre la classe `px-2.5` de la variante,
  `cva` ne fusionnant pas les classes (mesuré : les deux sont présentes, padding calculé 10 px).
- **N8** — le bouton « Mes favoris » de la barre mobile a une zone de 36 × 36 px, quand le bouton
  menu voisin fait 44 × 44.

## Contrat de données

Aucun.

## Direction UX / Artistique

- Le menu se comporte comme les autres panneaux modaux du site public (le tiroir de filtres en est
  la référence) : voile, fermeture par tap extérieur, par Échap et par la croix, focus contenu.
- Le menu est un menu de **navigation** : les raccourcis de catégories disparaissent (le tiroir de
  filtres les porte tous), plutôt que d'être réparés.
- Bords gauches alignés entre la barre, le menu et le contenu de la page.

## Contraintes strictes (métier)

- Le verrou de défilement doit tenir **sur iOS Safari**, où `overflow: hidden` sur `body` ne suffit
  pas : la vérification se fait en émulation iOS ou sur appareil, pas seulement sur Chrome.
- Fermer le menu rend le focus au bouton qui l'a ouvert.

## Delta à produire

- [ ] Menu mobile modal : voile, verrou de défilement, fermeture par tap extérieur, focus contenu
      et restitué.
- [ ] Retrait de la rangée de catégories du menu mobile.
- [ ] Gouttière de la barre alignée sur celle du contenu sous `lg`.
- [ ] Lien « Connexion » aligné sur les autres entrées (fusion de classes).
- [ ] Zone tactile de 44 px pour « Mes favoris » en barre mobile, sans changer son dessin.
- [ ] Tests : tap extérieur ferme ; Échap ferme et rend le focus ; le document ne défile pas menu
      ouvert.

## Critères d'acceptation

- [ ] AC1 — menu ouvert à 390 × 844, un `scrollBy(0, 500)` du document laisse `scrollY` inchangé ;
      menu fermé, il redevient effectif.
- [ ] AC2 — un tap sur le voile ferme le menu ; le focus revient au bouton menu.
- [ ] AC3 — menu ouvert, Tab ne fait jamais sortir le focus du panneau.
- [ ] AC4 — la position x du **texte** (pas de la boîte) de « Connexion » est égale à celle
      d'« Acheter », à 1 px près.
- [ ] AC5 — le logo et le `<h1>` de `/properties` commencent au même x à 360 et 390 px.
- [ ] AC6 — la zone tactile de « Mes favoris » en barre mobile mesure au moins 44 × 44 px.

## Hors périmètre

- Le bloc de recherche du menu (retiré par TCK-549).
- Le choix de langue dans le menu (TCK-550).

## Notes d'implémentation

_(à remplir par implementing-specs)_
