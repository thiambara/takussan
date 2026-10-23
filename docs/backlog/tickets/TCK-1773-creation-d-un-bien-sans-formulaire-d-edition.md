---
id: TCK-1773
title: "La page de création d'un bien ne télécharge plus le formulaire d'édition"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-173--écrans-qui-chargent-les-composants-client-de-la-console-par-les-autres-fichiers-indexts-réexportateurs"
tags: [front, performance, biens, pistes]
---

## Objectif utilisateur

L'agent ou le bailleur qui ouvre `/app/properties/new` ne télécharge que l'assistant de
création, pas le formulaire d'édition qu'il n'affiche pas.

## Contexte

Réf : **P173.02** du fichier de pistes, `retenu · autonome` (A2, garde A5).

Mesuré avant correctif sur `5932bac2b` : la page prend `PropertyWizard` à
`@/components/property-form`, dont l'`index.ts` réexporte aussi `PropertyForm` ; le graphe client
de la page contient `property-form/PropertyForm.tsx` et `hooks/useAvertissementDepart.ts` (garde
neuve, 1 rouge sur 2). La fiche du bien charge `PropertyForm` par `next/dynamic` (TCK-1040).

## Hypothèses (mode sans humain)

- La page était le seul importeur de l'`index.ts` hors tests : il est retiré, comme la piste le
  propose. Les trois `vi.mock('@/components/property-form')` des tests de la page visent désormais
  `@/components/property-form/PropertyWizard` ; celui de `PropertyCalendarPanel.test.tsx`, qui ne
  simulait plus rien (aucun module n'importait l'index sous ce test), vise
  `@/components/property-form/PropertyForm`, ce que charge `PropertyDetailTabs`.

## Delta à produire

- [x] `properties/new/page.tsx` prend `PropertyWizard` à son fichier.
- [x] `components/property-form/index.ts` retiré.
- [x] Les quatre `vi.mock` suivent.
- [x] Garde : `app/__tests__/graphe-client-de-la-creation-d-un-bien.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le graphe client de la page contient `PropertyWizard.tsx` (témoin).
- [x] AC2 — Il ne contient ni `PropertyForm.tsx` ni `hooks/useAvertissementDepart.ts`.

## Notes d'implémentation

- Ablation : `index.ts` et l'import de la page remis à leur état antérieur → 1 rouge sur 2 ;
  rétablis → 2 verts.
- Piège : la garde vit sous `src/app/__tests__/`, pas sous `properties/new/__tests__/`. Placée
  sous `(dashboard)/app`, elle faisait entrer `src/test/analyse-statique.ts` dans le « reste non
  gardé » de l'écran `/app` que compte `scripts/check-super-admin-tokens.mjs` (19 > 17).
