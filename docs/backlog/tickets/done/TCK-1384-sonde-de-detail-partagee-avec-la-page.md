---
id: TCK-1384
title: "La sonde d'existence des fiches partage sa lecture avec la page, et n'envoie plus `fields` à un `show`"
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
tags: [web, performance, detail, pistes]
---

## Contexte

Réf : **P138.04** du fichier de pistes, `retenu · autonome` (A2, A6, A5). La sonde
`sonderExistence` des huit `[id]/layout.tsx` de `/app` ne partageait sa promesse avec aucune page :
`/app/properties/5` et `/app/customers/5` lisaient leur fiche deux fois. Son en-tête affirmait le
contraire. Elle envoyait `fields[<table>]=id` à un `show`, qui l'ignore (P60.03), et la garde de
P60.03 ne la voyait pas : son motif exigeait un segment littéral après `/api/`.

## Delta à produire

- [x] `lireBienDuRendu` et `lireClientDuRendu` (`ressource-de-detail.ts`, sous `cache()`) : la
      sonde de `properties` et `customers` passe par elles, et les deux pages lisent par elles.
- [x] Les six autres segments sondent le `show` sans `fields[...]` ; la colonne `table` de
      `RESSOURCES_DE_DETAIL` disparaît avec lui.
- [x] L'en-tête du module dit ce que fait le code.
- [x] `show-sans-fields.garde.test.ts` : le motif voit les segments interpolés (témoin ajouté).
- [x] Garde : `src/lib/detail/__tests__/ressource-de-detail.partage.tck-1384.test.ts`.

## Critères d'acceptation

- [x] AC1 — `exigerRessource('properties'|'customers', '5')` puis la lecture de la page : un appel.
- [x] AC2 — Un 403 de la lecture partagée reste « non introuvable », et la page le reçoit.
- [x] AC3 — Les autres sondes lisent `/api/<ressource>/<id>`, sans `fields[...]`.
- [x] AC4 — La garde de P60.03 refuse `/api/${api}/${id}?fields[…]`.

## Hors périmètre

- La sonde des six segments lus au navigateur reste une lecture de plus au serveur ; pour le bail,
  le `show` charge bien, locataire et signatures. L'option « liste filtrée par `id` » n'a pas été
  retenue par le classement (périmètre d'autorisation différent du `show`).
- Le docblock des huit `[id]/layout.tsx` répète encore « la page qui relit la même ressource
  partage la promesse » : vrai pour deux d'entre eux seulement.

## Notes d'implémentation

- La page des biens passait l'identifiant en chaîne : elle passe `Number(id)` (déjà validé
  entier par le layout), pour que la clé de `cache()` soit celle de la sonde.
- Ablation : sonde rendue à sa lecture propre avec `fields[...]` → 4 rouges sur 6 (partage et
  garde) ; remis → 6 verts, 44 avec les tests voisins.
