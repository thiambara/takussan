---
id: TCK-2534
title: Les squelettes de chargement sont invisibles sur le fond de la console super-admin
status: todo
phase: P1
family: front
estimate: S
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models: []
tags: [front, super-admin, design-system, loading-state, audit-ux]
---

## Objectif utilisateur

Pendant qu'une liste de la console super-admin se charge, l'opérateur voit que quelque chose
arrive — au lieu d'un grand vide qu'il prend pour une liste vide ou un écran cassé.

## Constat (mesuré)

Relevé par la revue adverse de TCK-2520 (2026-11-09), sur `/super-admin/boosts/agences`, la
requête de la liste suspendue par un `initScript` du navigateur : cinq `div.animate-pulse` sont
bien présents dans le DOM, mais leur fond est **rgb(241, 236, 224)** — exactement celui de `main`.
L'écran montre ~280 px vides pendant tout le chargement.

La cause est dans deux fichiers partagés, et le défaut est **antérieur** à TCK-2520 : il vaut pour
tous les onglets de la console qui affichent un état de chargement directement sur le fond.

- `takussan-web/src/components/ui/skeleton.tsx` — `Skeleton` est `animate-pulse rounded-md bg-muted` ;
- `takussan-web/src/components/layout/SuperAdminShell.tsx` — la coque et sa zone `main` sont
  `bg-muted` (`--muted: #f1ece0` en clair, `#3a2e23` en sombre) ;
- `takussan-web/src/components/console/DataState.tsx` rend ces `Skeleton` pour l'état de
  chargement (utilisé par les listes de la console, dont `DataTable`).

Même couleur que le fond : le squelette n'a aucun contraste, en thème clair comme en sombre.

## Delta à produire

- Donner au squelette un contraste visible sur le fond de la console, sans le perdre sur les fonds
  `--card` et `--background` où il est déjà lisible (le site public et `/app` ne doivent pas
  changer d'apparence) — par exemple un fond de squelette qui se distingue de `--muted`, ou un
  état de chargement des listes de console posé sur une surface `--card`.
- Recenser les écrans de `/super-admin/*` qui rendent un état de chargement directement sur le fond
  de la coque, et vérifier chacun.

## Critères d'acceptation

- [ ] AC1 — Sur `/super-admin/boosts/agences`, requête de liste suspendue : les squelettes se
  distinguent du fond de `main`, en thème clair ET sombre (couleurs calculées différentes, relevées
  au navigateur, 390×844 et 1440×900).
- [ ] AC2 — Un écran du site public et un écran de `/app` qui affichent des squelettes gardent leur
  apparence (relevé avant/après).

## Hors périmètre

- Le contenu des états vide et erreur, déjà lisibles (revue de TCK-2520).

## Notes d'implémentation

_(à remplir par implementing-specs)_
