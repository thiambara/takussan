---
id: TCK-1386
title: "Écrire que seule `cache()` dédoublonne une lecture serveur, et le garder"
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
    - docs/features.md#21-authentification--comptes
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-138--lectures-de-lapi-dédoublées-dans-un-même-rendu-serveur"
tags: [web, performance, documentation, pistes]
---

## Contexte

Réf : **P138.01** du fichier de pistes, `retenu · autonome` (A5). `apiRequest` pose un
`X-Request-Id` neuf sur chaque appel serveur (TCK-950) ; la mémoïsation de `fetch` par Next met
tous les en-têtes dans sa clé : deux lectures identiques d'un rendu partent deux fois. Rien ne
l'écrivait, et les en-têtes du dépôt ne citaient que `cache()`, sans dire qu'elle est la seule.

## Delta à produire

- [x] Docblock d'`apiRequest` : la seule déduplication serveur est `cache()`, pourquoi, et la règle.
- [x] Garde : `src/lib/__tests__/api.deduplication-serveur.tck-1386.test.ts` (clé de Next distincte
      pour deux lectures identiques ; l'en-tête le dit). Les tests qui comptent les appels d'un
      rendu sont ceux du lot : TCK-1374, 1376, 1378, 1380, 1382, 1384.

## Critères d'acceptation

- [x] AC1 — Deux appels serveur identiques n'ont pas la même clé de Next ; seul l'identifiant diffère.
- [x] AC2 — L'en-tête d'`apiRequest` nomme `cache()`, `X-Request-Id` et `dedupe-fetch`.

## Reste à faire

> la même règle dans « Couche réseau » de `takussan-web/CLAUDE.md`, chemin fermé à l'implémenteur

## Notes d'implémentation

- Ablation : `api.ts` rendu à son état antérieur → 1 rouge (l'en-tête) ; remis → 2 verts.
