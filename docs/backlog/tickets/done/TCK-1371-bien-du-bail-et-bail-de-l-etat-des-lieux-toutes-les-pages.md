---
id: TCK-1371
title: "Le choix du bien d'un nouveau bail et celui du bail d'un état des lieux lisent toutes les pages"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1367]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#19-état-des-lieux--inventaires"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [front, baux, etat-des-lieux, pagination, pistes]
---

## Contexte

Réf : **P135.04** du fichier de pistes, `validé (délégué)` (V7 accordé).

`useLeasePropertyOptions` lit une page de 100 biens louables, et `InventoryLeasePicker` une page de
50 baux actifs, sans page suivante ni recherche : au-delà, le 101ᵉ bien ne se choisit pas, et le
51ᵉ bail ne s'ouvre pas depuis l'écran de choix.

## Décision du porteur (déléguée)

> le formulaire de bail lit toutes les pages des biens louables (`useLeasePropertyOptions`, `sort=title`, `per_page=100`, pages suivantes jusqu'à `meta.last_page`) et `InventoryLeasePicker` toutes les pages des baux actifs, comme `fetchAllLeasePayments` de TCK-1178, sans recherche ni filtre neufs dans l'API ; test : 101 biens louables, le 101ᵉ se choisit, et 51 baux actifs, le 51ᵉ s'ouvre ; reste : la recherche serveur du bien et du bail, et le compte « liste coupée »

## Reste à faire

> la recherche serveur du bien et du bail, et le compte « liste coupée »

## Objectif utilisateur

L'agent trouve tous ses biens louables en créant un bail, et tous ses baux actifs en ouvrant un
état des lieux.

## Contrat de données

Aucun changement d'API : `GET /api/properties` (`filter[status]`, `sort=title`) et
`GET /api/leases` (`filter[status]=active`, `include=property`, `sort=-created_at`), `page`,
`per_page=100`.

## Delta à produire

- [x] `useLeasePropertyOptions` lit toutes les pages (`lireToutesLesPages`, TCK-1367) ; il sert
  aussi le filtre par bien de `LeasesList`, qui en profite.
- [x] `InventoryLeasePicker` lit tous les baux actifs, par un lecteur de toutes les pages.
- [x] Tests : 101 biens louables, le 101ᵉ est proposé ; 51 baux actifs, le 51ᵉ a son lien.

## Critères d'acceptation

- [x] AC1 — Pour 101 biens louables, les deux pages sont lues (`sort=title`, `per_page=100`) et
  le 101ᵉ est rendu par le hook.
- [x] AC2 — Pour 51 baux actifs, `InventoryLeasePicker` rend 51 liens, dont celui du 51ᵉ.
- [x] AC3 — Les statuts demandés pour les biens ne changent pas (test TCK-776 gardé).

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- « Le 101ᵉ se choisit » est éprouvé au niveau du hook (`renderHook`, 101 biens rendus) : le
  formulaire passe la liste entière à son `EntitySelect`, sans coupure de son côté (lu).
- `InventoryLeasePicker` passe de `useLeases({ per_page: 50 })` à un hook neuf, `useAllActiveLeases`,
  sous une clé `['leases', 'list', …]` : les invalidations de `['leases']` le rafraîchissent.
- `CreateLeaseForm.biens-proposes.test.tsx` (TCK-776) bouchonnait `useApiQuery` : il bouchonne
  désormais `useQuery`, et lit les statuts demandés dans l'URL réellement envoyée.
- Ablation : `leases.ts` et `InventoryLeasePicker.tsx` rendus à `HEAD` → 2 rouges sur 2 (100 biens,
  50 liens) ; correctif remis → 2/2 verts.
