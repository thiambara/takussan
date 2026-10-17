---
id: TCK-744
title: "Listes de valeurs de bien hors du module de schémas : zod quitte les pages publiques"
status: done
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
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-33--poids-js-des-routes-publiques"
tags: [front, performance, bundle, zod, pistes]
---

## Contexte

Réf : **P33.03** du fichier de pistes, `retenu · autonome` (classement A2, garde A5).

`PropertyCard`, `NewBuildChip`, `FilterSidebar` et `property-form/options.ts` n'importent de
`@/lib/schemas/property` que des tableaux `as const`. Ce module commence par
`import { z } from 'zod'` et construit ses schémas au chargement : zod entre dans le JS initial
de l'accueil, de la recherche, des fiches bien, agence et agent, et des favoris.

## Objectif

Sur une page publique, zod et react-hook-form n'arrivent plus que par un formulaire.

## Contrat de données

Aucun. Aucune valeur ne change : les listes sont déplacées telles quelles.

## Contraintes strictes

- `@/lib/schemas/property` réexporte les neuf listes : ses importeurs de formulaire ne bougent pas.
- **Hypothèse** : la garde est un test sur le graphe client (le traceur de TCK-743, mutualisé dans
  `src/test/graphe-client.ts`) plutôt que la règle `no-restricted-imports` de la piste : la règle
  ne verrait pas un chemin indirect (`PropertyHeader → NewBuildChip → schemas`), le traceur si.
- **Hypothèse** : deux formulaires publics sont admis à porter zod, nommés dans la table du test :
  le tunnel de réservation (`BookingTunnel`) et l'enregistrement de recherche (`SaveSearchButton`).

## Delta à produire

- [x] `src/lib/enums/property.ts`, sans import : les neuf listes de valeurs.
- [x] `src/lib/schemas/property.ts` les importe et les réexporte.
- [x] `PropertyCard`, `NewBuildChip`, `FilterSidebar`, `property-form/options.ts` importent
      `@/lib/enums/property`.
- [x] `src/test/graphe-client.ts` (traceur mutualisé, `js-initial-du-layout-racine.test.ts` s'y
      branche).
- [x] Garde `src/app/[locale]/(public)/__tests__/zod-hors-des-pages-publiques.test.ts`.

## Critères d'acceptation

- [x] AC1 — Pour chaque `page.tsx` et `layout.tsx` de `[locale]/(public)`, le graphe client
      n'atteint `zod`, `react-hook-form` ou `@hookform/resolvers` que par un formulaire admis.
- [x] AC2 — `npx tsc --noEmit` propre : tous les importeurs des listes compilent.
- [x] AC3 — Les tests qui importent ces modules restent verts.

## Hors périmètre

- Les autres importeurs de listes depuis `@/lib/schemas/property` (console `/app`, profil) :
  pages non publiques.
- Différer les dialogues de la fiche (P33.04, à valider : V8).

## Notes d'implémentation

- Avant correctif, six entrées publiques rougissent : accueil, recherche, fiches bien, agence et
  agent, favoris, toutes par `PropertyCard` ou `NewBuildChip` → `schemas/property` (et
  `schemas/common`). La règle `no-restricted-imports` de la piste n'aurait pas vu le chemin
  `PropertyHeader → NewBuildChip`.
- Ablation : `NewBuildChip` seul rendu à `@/lib/schemas/property` → les six mêmes rouges.
  Correctif remis : 20/20 verts.
- 37 fichiers de tests importent ces modules : 520/521 verts en une exécution groupée ; le rouge,
  `FilterSidebar.retour.test.tsx` (« aucune entrée fantôme », interaction), est vert seul (15/15),
  charge `vm.loadavg` montée de 2,0 à 7,7 sur 8 cœurs.
