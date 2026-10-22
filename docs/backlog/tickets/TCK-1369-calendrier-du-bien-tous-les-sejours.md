---
id: TCK-1369
title: "Le calendrier d'un bien lit tous ses séjours confirmés, pas les 100 plus anciens"
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
    - "docs/features.md#13-réservations-courte-durée--visites"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-135--listes-écrites-à-la-main-et-lecteurs-qui-ne-lisent-que-la-première-page"
tags: [front, reservations, calendrier, pagination, pistes]
---

## Contexte

Réf : **P135.03** du fichier de pistes, `validé (délégué)` (V7 accordé).

`usePropertyConfirmedStays` demande une page de 100 séjours confirmés, triés par `start_date`
croissant. Aucun séjour ne passe à `completed` : passé 100 séjours, les plus récents, donc ceux à
venir, sortent de la page, et le calendrier montre libres des nuits réservées.

## Décision du porteur (déléguée)

> le calendrier lit toutes les pages des séjours confirmés du bien (`sort=start_date`, `per_page=100`, pages suivantes jusqu'à `meta.last_page`), comme `fetchAllLeasePayments` de TCK-1178, sans filtre de date neuf dans l'API ; test : bien à 100 séjours confirmés passés et 1 à venir, le séjour à venir est peint

## Reste à faire

> le passage des séjours finis de `confirmed` à `completed`, et toute borne de date côté API

## Objectif utilisateur

L'hôte voit réservées toutes les nuits de ses séjours confirmés, quel que soit leur nombre.

## Contrat de données

Aucun changement d'API : `GET /api/bookings` avec `filter[property_id]`, `filter[status]=confirmed`,
`sort=start_date`, `page`, `per_page=100`.

## Delta à produire

- [x] `usePropertyConfirmedStays` lit toutes les pages par `lireToutesLesPages` (TCK-1367).
- [x] Test du panneau, API bouchonnée : 100 séjours passés et 1 en cours, sa nuit est peinte.

## Critères d'acceptation

- [x] AC1 — Pour 101 séjours confirmés, les deux pages sont lues, `sort=start_date`, `per_page=100`.
- [x] AC2 — La nuit du séjour au-delà de la première page est peinte « réservée ».

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Le test monte le panneau avec ses vrais hooks, `fetch` bouchonné. Le séjour hors de la première
  page couvre la nuit d'aujourd'hui, pour tomber dans le mois affiché quel que soit le jour du test.
  Sonde (retirée) : le même séjour placé en tête de la première page est peint, donc le sélecteur
  de cellule voit bien la classe `booked`.
- `useApiQuery` ne sait lire qu'une page : le hook passe à `useQuery` + `apiRequest`, comme
  `useLeasePayments` (TCK-1178), sous la même clé de cache (les invalidations restent justes).
- Ablation : `property-calendar.ts` rendu à `HEAD` → 1 rouge sur 1 (nuit d'aujourd'hui non peinte,
  une seule page lue) ; correctif remis → vert.
