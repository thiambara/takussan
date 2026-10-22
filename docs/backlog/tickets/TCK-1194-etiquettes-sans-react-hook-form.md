---
id: TCK-1194
title: "Console, étiquettes : ni react-hook-form ni sélecteur de date dans le graphe client"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#lécran-des-étiquettes-charge-react-hook-form-et-le-calendrier-pour-afficher-deux-messages-derreur-par-le-fichier-indexts-de-componentsforms"
tags: [front, performance, super-admin, pistes]
---

## Contexte

Réf : **P104.01** du fichier de pistes, `retenu · autonome` (A2 : performance sans changement de
résultat). `TagsManager` prend `FormError` et `FormGlobalError` au fichier `index.ts` de
`components/forms`, qui réexporte les champs liés à react-hook-form et les sélecteurs de date, et
`useTraducteurValidation` à `hooks/useApiForm.ts`, qui importe react-hook-form et
`@hookform/resolvers`. Son formulaire est tenu par `useState`. `/super-admin/tags` était l'écran le
plus lourd de la console (452,2 Kio gzip, mesure de l'explorateur ; 399,6 après l'ablation des deux
imports).

## Objectif

Le graphe client de `/super-admin/tags` n'atteint plus react-hook-form, `@hookform/resolvers`,
react-day-picker ni date-fns.

## Delta à produire

- [x] `hooks/useTraducteurValidation.ts` : le crochet, sans react-hook-form ; `useApiForm.ts` le
      réexporte, ses trois autres appelants inchangés.
- [x] `TagsManager` importe `FormError` de `@/components/forms/FormError` et le crochet de son
      module.
- [x] Garde : `(super-admin)/super-admin/__tests__/graphe-client-de-la-console.test.ts`.

## Critères d'acceptation

- [x] AC1 — `paquetsDuGrapheClient` de `tags/page.tsx` ne rend aucun chemin vers ces quatre
      paquets.
- [x] AC2 — Rendu et comportement de `TagsManager` inchangés (`TagsManager.test.tsx` vert).

## Hors périmètre

- zod, qui reste par `lib/schemas/tag.ts` : P104.02.
- La garde générale sur toutes les pages de la console : P104.04.
- Un build pour re-mesurer le poids : la garde porte sur le graphe, le poids est la mesure de
  l'explorateur.

## Notes d'implémentation

- Ablation (2026-10-22) : `TagsManager.tsx` rendu à `pre-dev` → la garde rougit avec quatorze
  chemins (react-hook-form par sept champs de `forms/index.ts` et par `useApiForm.ts`,
  react-day-picker et date-fns par `FormDateTimePicker` et `FormDatePicker`) ; correctif remis →
  verte.
- `useApiForm.ts` importe aussi le crochet depuis le nouveau module, pour son propre usage dans
  `useResolveurValidation`.
