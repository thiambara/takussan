---
id: TCK-1038
title: "Maintenance et états des lieux : les pages importent leurs composants sans passer par un fichier index.ts"
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
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, zod, pistes]
---

## Contexte

Réf : **P70.01** du fichier de pistes, `retenu · autonome` (A2 : importer chaque composant par son
propre fichier ne change aucun rendu ; A5 : la garde).

Les six pages de `/app/maintenance` et `/app/inventories` importent leurs composants par
`@/components/maintenance` et `@/components/inventory`, deux fichiers `index.ts` qui réexportent
aussi les formulaires du dossier (`MaintenanceForm`, `QuoteRejectionModal`,
`MaintenanceCompleteForm`, `InventoryForm`…). Le bundler ne les élague pas : zod et
react-hook-form entrent dans le JS initial des deux listes et de la fiche d'état des lieux, qui
n'affichent aucun formulaire au chargement.

## Objectif

Les listes de maintenance et d'états des lieux, et la fiche d'état des lieux, ne chargent plus zod.

## Contrat de données

Aucun. Aucun composant ne change : seuls les chemins d'import bougent.

## Contraintes strictes

- **Hypothèse** : la garde est un test sur le graphe client (`src/test/graphe-client.ts`, celui de
  TCK-744) plutôt que la règle `no-restricted-imports` que la piste propose en premier : le test
  voit aussi un chemin indirect, et il refuse le retour des deux `index.ts`.
- **Hypothèse** : `/app/maintenance/[id]` n'entre pas dans la garde. Le mesureur y a trouvé zod par
  d'autres chemins que le fichier `index.ts` (gain dans la marge de la coque) : ce n'est pas le
  défaut de cette piste.

## Delta à produire

- [x] Les six pages importent chaque composant par son fichier.
- [x] `src/components/maintenance/index.ts` et `src/components/inventory/index.ts` retirés : ils
      n'ont plus d'importeur.
- [x] Les mocks des deux tests de `inventories/` suivent les nouveaux chemins.
- [x] Garde `src/app/(dashboard)/__tests__/zod-hors-des-ecrans-de-lecture.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le graphe client de `maintenance/(liste)`, `inventories/(liste)` et `inventories/[id]`
      n'atteint ni `zod`, ni `react-hook-form`, ni `@hookform/resolvers`.
- [x] AC2 — Aucun fichier `index.ts` sous `components/maintenance` ni `components/inventory`.
- [x] AC3 — Les tests des pages et des composants des deux dossiers restent verts.

## Hors périmètre

- Les autres chemins de zod vers `/app/maintenance/[id]`.
- Les autres fichiers `index.ts` de `src/components/` (aucune mesure ne les accuse).

## Notes d'implémentation

- Avant correctif, 5 rouges sur 8 : les trois écrans atteignent zod par
  `components/<dossier>/index.ts` (`QuoteRejectionModal`, `MaintenanceCompleteForm`,
  `InventoryForm`), et les deux `index.ts` existent.
- Ablation : les deux `index.ts` et les imports des trois pages remis → les 5 mêmes rouges ;
  correctif remis → 8/8 verts.
