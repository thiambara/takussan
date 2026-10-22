---
id: TCK-1382
title: "`/app/properties` : « Total » pris à la liste, comptes sans `include`"
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
    - docs/features.md#11-gestion-des-biens
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-138--lectures-de-lapi-dédoublées-dans-un-même-rendu-serveur"
tags: [web, performance, biens, pistes]
---

## Contexte

Réf : **P138.08** du fichier de pistes, `retenu · autonome` (A2). `/app/properties` envoyait six
`GET /api/properties` par document : la liste et cinq comptes à `per_page=1` qui portaient
`include=address,owner,collaborators` et le sparse fieldset de la liste. Sans filtre, « Total »
redemandait le `meta.total` de la liste.

## Delta à produire

- [x] `countDashboardProperties` (`properties-server.ts`) : mêmes filtres que la liste,
      `per_page=1`, `fields[properties]=id`, sans `include` ni tri.
- [x] La page compte par elle, et prend « Total » dans `meta.total` de la liste quand aucun filtre
      autre que la portée (`user_id`) n'est posé, archives comprises.
- [x] Les quatre tests de la page qui mockent `properties-server` connaissent la nouvelle lecture ;
      celui de TCK-865 compte désormais la liste et quatre compteurs.
- [x] Garde : `properties/(liste)/__tests__/comptes.tck-1382.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Sans filtre : cinq appels (la liste et quatre comptes), « Total » = `meta.total`.
- [x] AC2 — Aucun compte ne porte `include=` ; tous portent `fields[properties]=id`.
- [x] AC3 — Avec un filtre, ou les archives incluses : « Total » reste compté à part (six appels).

## Notes d'implémentation

- Ablation : « Total » toujours compté et `include` remis dans les comptes → 2 rouges sur 4 ;
  remis → 4 verts, 20 avec les tests voisins de la page.
