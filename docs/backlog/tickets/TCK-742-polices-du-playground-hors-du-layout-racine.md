---
id: TCK-742
title: "Polices : le layout racine ne précharge que Bricolage et DM Sans"
status: todo
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-33--poids-js-des-routes-publiques"
tags: [front, performance, fonts, pistes]
---

## Contexte

Réf : **P33.01** du fichier de pistes, `retenu · autonome` (classement A2, garde A5).

`src/app/layout.tsx` déclare six familles `next/font/google` (Geist, Manrope, Inter, Bricolage
Grotesque, DM Sans, Fraunces) et pose leurs six variables sur `<html>`. Toute famille déclarée au
layout racine est préchargée par toutes les routes. `globals.css` ne lit que DM Sans et Bricolage ;
Manrope, Inter et Fraunces ne sont lues que par `/playground`, Geist par personne. Mesuré par
l'explorateur : 139 routes préchargent 257 Kio de woff2, dont 180 Kio sans usage.

## Objectif

Hors de `/playground`, aucune route ne précharge plus que les deux familles du design system.

## Contrat de données

Aucun. Aucun rendu ne change : les familles du design system restent posées par la racine, celles
du playground par sa page.

## Contraintes strictes

- **Hypothèse** : la page du playground déclare elle-même ses trois familles plutôt qu'un
  `layout.tsx` propre, qui serait une frontière de dictionnaire (ADR-0022, commentaire de
  `playground/page.tsx`). L'enveloppe est en `display: contents`, sans boîte.

## Delta à produire

- [ ] `src/app/layout.tsx` : ne garder que `Bricolage_Grotesque` et `DM_Sans` ; Geist retirée.
- [ ] `src/app/[locale]/(public)/playground/page.tsx` : déclarer Manrope, Inter et Fraunces et
      poser leurs variables autour de `PlaygroundClient`.
- [ ] Garde `src/app/__tests__/polices-du-layout-racine.test.ts`.

## Critères d'acceptation

- [ ] AC1 — Chaque famille déclarée au layout racine est lue (variable ou nom de famille) par un
      fichier de `src/` hors du playground et des tests.
- [ ] AC2 — Chaque `var(--font-…)` que lit le playground est déclarée par la racine ou par sa page.

## Hors périmètre

- Le retrait de `/playground` des environnements déployés (P18.06).
- La mesure du CSS initial après ce correctif (P33.06).
- `docs/design-guidelines.md` et `takussan-web/CLAUDE.md` qui décrivent encore les six familles
  sur `<html>` (chemins fermés à l'implémenteur).

## Notes d'implémentation

_(à remplir par implementing-specs)_
