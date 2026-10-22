---
id: TCK-1202
title: "Console : la coque n'embarque plus `lib/queries/super-admin.ts` entier"
status: done
phase: P3
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-59"
tags: [front, performance, super-admin, pistes]
---

## Contexte

Réf : **P104.05** du fichier de pistes, `retenu · autonome` (A2). La coque de la console
(`SuperAdminTopbar` → `GlobalSearch`, `SuperAdminSidebar` et `ConsoleQueues` →
`super-admin-queues.ts`) prend `fetchGlobalSearch` et les quatre lecteurs des files à
`lib/queries/super-admin.ts` (1 515 lignes, 96 exports que le bundler n'élague pas) : environ
4,5 Kio gzip sur chacun des 37 écrans (mesure de l'explorateur). Motif de P70.07.

## Objectif

Le graphe client du layout de la console n'atteint plus `lib/queries/super-admin.ts`.

## Delta à produire

- [x] `lib/queries/super-admin-coque.ts` : `fetchGlobalSearch` (et `GlobalSearchHit`),
      `fetchAdminKycQueue`, `fetchModerationQueue`, `fetchFailedJobs`,
      `fetchAdminAgencyUpgradePendingCount`, avec `jsonOrThrow` et `KYC_DOSSIER_FIELDS` qu'ils
      partagent avec `super-admin.ts`.
- [x] `super-admin.ts` les réexporte (appelants inchangés) ; `GlobalSearch` et
      `super-admin-queues.ts` les prennent au nouveau module.
- [x] Garde : cas TCK-1202 dans `graphe-client-de-la-console.test.ts`.

## Critères d'acceptation

- [x] AC1 — `modulesDuGrapheClient(layout.tsx)` ne contient pas `lib/queries/super-admin.ts`.
- [x] AC2 — Aucun appelant ni résultat changé (`tsc`, tests de la barre latérale, des files, de la
      recherche, de la modération, des jobs et de la page KYC verts).

## Hors périmètre

- Un build pour re-mesurer le morceau de coque.

## Hypothèses

- L'ancre de la piste est la 60ᵉ section « Petites améliorations » du fichier (suffixe `-59`),
  calculée et non vérifiée par un rendu GitHub.

## Notes d'implémentation

- Ablation (2026-10-22) : `GlobalSearch.tsx` et `super-admin-queues.ts` rendus à `pre-dev` → le cas
  TCK-1202 rougit ; remis → vert.
- Piège : `ConsoleQueues.test.tsx` et `SuperAdminSidebar.test.tsx` mockaient
  `@/lib/queries/super-admin` pour les files ; ils mockent désormais `super-admin-coque`.
