---
id: TCK-1039
title: "Listes des biens et des clients de la console : les listes de valeurs hors des modules de schémas"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, zod, pistes]
---

## Contexte

Réf : **P70.02** du fichier de pistes, `retenu · autonome` (A2 : déplacer des tableaux `as const`
dans un module sans dépendance, patron écrit de TCK-744 ; A5 : la garde).

Quatre composants de la liste des biens (`PropertyList`, `PropertyListFilters`,
`PropertyStatusBadge`, `PropertyRowActions`) importent des listes de valeurs depuis
`@/lib/schemas/property`, alors que TCK-744 les a mises dans `@/lib/enums/property`. Trois
fichiers de la liste des clients (`CustomerList`, `CustomerListFilters`, `customer-form/options.ts`)
les lisent dans `@/lib/schemas/customer`, et aucun module sans dépendance ne les porte. Les deux
modules de schémas commencent par `import { z } from 'zod'` : zod entre dans le JS initial de
`/app/properties` et `/app/customers`.

## Objectif

Les listes des biens et des clients de la console ne chargent plus zod.

## Contrat de données

Aucun. Les trois listes de client sont déplacées telles quelles.

## Contraintes strictes

- `@/lib/schemas/customer` réexporte `customerStatusValues`, `pipelineStageValues` et
  `idTypeValues` : ses importeurs de formulaire ne bougent pas.
- **Hypothèse** : la garde est celle de TCK-1038 (`zod-hors-des-ecrans-de-lecture.test.ts`),
  étendue aux deux listes, plutôt qu'une extension de `zod-hors-des-pages-publiques.test.ts` que
  la piste propose : ce test ne trace que `[locale]/(public)`, et celui de TCK-1038 trace déjà les
  écrans de lecture de la console avec le même `src/test/graphe-client.ts`.
- **Hypothèse** : `customerLocaleValues`, `seekingContractTypeValues` et
  `seekingPropertyTypeValues` restent dans `schemas/customer.ts` : aucun composant d'affichage de
  la liste ne les lit.

## Delta à produire

- [x] `src/lib/enums/customer.ts`, sans import : trois listes de valeurs.
- [x] `src/lib/schemas/customer.ts` les importe et les réexporte.
- [x] Les quatre importeurs côté biens lisent `@/lib/enums/property`, les trois côté clients
      `@/lib/enums/customer`.
- [x] `properties/(liste)` et `customers/(liste)` ajoutés à la garde de TCK-1038.

## Critères d'acceptation

- [x] AC1 — Le graphe client de `properties/(liste)` et `customers/(liste)` n'atteint ni `zod`, ni
      `react-hook-form`, ni `@hookform/resolvers`.
- [x] AC2 — `npx tsc --noEmit` propre : tous les importeurs des listes compilent.
- [x] AC3 — Les tests des composants et schémas touchés restent verts.

## Hors périmètre

- Les autres chemins de zod vers la fiche bien (`/app/properties/[id]`, P70.03) et les fiches
  client.
- Les autres importeurs de `@/lib/schemas/property` et `@/lib/schemas/customer` (formulaires).

## Notes d'implémentation

- Avant correctif, 2 rouges : `PropertyListFilters` → `schemas/property` et
  `CustomerListFilters` → `schemas/customer` (le traceur ne rend qu'un chemin par paquet ; les
  autres importeurs cités suivent le même motif, lu).
- Ablation : les sept importeurs rendus à `@/lib/schemas/*` (module `enums/customer` gardé) → les
  2 mêmes rouges ; correctif remis → 12/12 verts.
- Tests des dossiers touchés (49 fichiers, 278 tests) groupés, charge `vm.loadavg` 3,1 puis 7,4 sur
  8 cœurs : 3 rouges d'interaction (`PropertyActions.statut.tck-633`, deux cas ;
  `PropertyListFilters.mobile.tck-644`, à 20,8 s du plafond). Rejoués seuls : `tck-633` rouge une
  fois puis vert deux fois avec le correctif, vert sans lui ; `tck-644` vert. Ces fichiers ne
  lisent pas les listes déplacées autrement que par leurs valeurs, qui n'ont pas changé.
