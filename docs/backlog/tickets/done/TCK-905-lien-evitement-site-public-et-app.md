---
id: TCK-905
title: "Lien d'évitement sur le site public et dans l'espace applicatif"
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
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#aucun-lien-dévitement-hors-de-la-console-super-admin"
tags: [front, a11y, pistes]
---

## Contexte

Réf : **P31.04** du fichier de pistes, `retenu · autonome` (A4).

Le seul « Aller au contenu principal » du front était celui de `SuperAdminShell` (TCK-359). Sur
le site public, le premier Tab allait au logo, puis 17 autres traversaient la `Navbar` avant le
contenu ; `AppShell` rendait un `<main>` sans `id` ni `tabIndex`, sans lien qui y mène. Le libellé
existait en trois langues, mais rangé sous `nav.superAdmin`.

## Objectif utilisateur

Un visiteur au clavier saute la barre de navigation, publique ou applicative, d'une seule touche.

## Delta à produire

- [x] `LienEvitement` partagé (le motif de `SuperAdminShell`), et sa cible `CONTENU_PRINCIPAL_ID`
  dans un module sans directive.
- [x] Le lien en tête de `Navbar` et d'`AppShell` ; `SuperAdminShell` monte le même composant,
  vers sa propre cible.
- [x] `id={CONTENU_PRINCIPAL_ID}` et `tabIndex={-1}` sur le `<main>` de chaque page qui monte la
  `Navbar`, et sur celui d'`AppShell`.
- [x] Clé `nav.superAdmin.skipToContent` déplacée en `common.skipToContent`, textes inchangés dans
  les trois langues.

## Critères d'acceptation

- [x] AC1 — Le lien est le premier élément focalisable de la `Navbar` et d'`AppShell`, masqué hors
  focus.
- [x] AC2 — L'activer déplace le focus dans le `<main>`.
- [x] AC3 — Chaque page qui monte la `Navbar` (hors `loading.tsx`) pose la cible sur son `<main>`.
- [x] AC4 — Aucun texte neuf.

## Hors périmètre

- Les `loading.tsx` qui montent la `Navbar` : squelettes `aria-hidden`, sans contenu où sauter.
- Le parcours au Tab dans un vrai navigateur (non rejoué).

## Notes d'implémentation

- **Reproduction** : `Navbar.lien-evitement.test.tsx` et `AppShell.lien-evitement.test.tsx` → 5
  rouges (aucun lien ; 21 `<main>` sans la cible).
- **Ablation** : correctif retiré, tests gardés → les 5 mêmes rouges ; remis → 17 verts, dont
  `SuperAdminShell.a11y.test.tsx`.
- **Piège** : `CONTENU_PRINCIPAL_ID` vit dans `contenu-principal.ts`, pas dans
  `LienEvitement.tsx` (`'use client'`) : importée de là par une page serveur, la constante serait
  une référence client et non la chaîne.
- La garde statique ignore un `<main>` cité entre accents graves (commentaire de
  `HomepageDiscovery`).
