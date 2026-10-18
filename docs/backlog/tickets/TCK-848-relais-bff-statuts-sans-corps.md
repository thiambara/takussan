---
id: TCK-848
title: "Relais BFF : un 204 de l'API reste un 204, au lieu d'un 500"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-console-super-admin-rend-une-erreur-500-quand-lapi-répond-204--la-suppression-dun-bien-dune-règle-dalerte-et-la-remise-dune-prise-de-modération-sont-faites-mais-affichées-en-échec"
tags: [front, bff, console, pistes]
---

## Contexte

Réf : **P41.01** du fichier de pistes, `retenu · autonome` (A1).

Cinq relais BFF (`super-admin`, `super-admin-properties`, `admin-users`, `announcements`,
`impersonation/proxy`) recopient le corps amont dans `new NextResponse(corps, { status })`. Sur un
204, ce corps non nul fait lever le constructeur : le handler rend 500 alors que l'API a fait
l'écriture (suppression d'un bien, d'une règle d'alerte, remise d'une prise de modération). Les
appelants de `super-admin.ts` attendent pourtant `res.status === 204`, et le relais `agencies`
traite déjà 204, 205 et 304 à part : le comportement attendu est écrit.

## Objectif utilisateur

Une suppression faite depuis la console s'affiche comme faite.

## Delta à produire

- [x] `src/lib/statut-sans-corps.ts` : `statutSansCorps(statut)`, vrai pour 204, 205, 304.
- [x] Les cinq relais passent un corps `null` pour ces statuts.
- [x] Test : chaque relais, amont 204, 205 et 304 → même statut, corps nul ; un 200 garde son corps.

## Critères d'acceptation

- [x] AC1 — Chacun des cinq relais rend 204 (resp. 205, 304), sans corps, quand l'API le rend.
- [x] AC2 — Une réponse 200 reste relayée avec son corps.

## Hors périmètre

- La fonction de relais commune et le chemin interne de l'API (P41.02, P41.03, à valider).
- Le relais `agencies`, déjà juste.

## Notes d'implémentation

- **Ablation** : correctif retiré des cinq relais → 15 tests rouges sur 16
  (`TypeError: Response constructor: Invalid response status code 204/205/304`) ; remis → 16 verts.
