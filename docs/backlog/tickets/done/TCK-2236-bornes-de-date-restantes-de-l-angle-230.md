---
id: TCK-2236
title: "Statistiques de boost, visites, offre d'achat et délégations : des bornes de date tirées du jour de l'API"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#22-rôles--permissions"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-230--règles-de-date-relatives-au-jour-de-lapi-face-aux-bornes-des-champs-du-front"
tags: [front, dates, visites, boost, delegations, pistes]
---

## Contexte

Réf : **P230.05** du fichier de pistes, `retenu · autonome` (A1 : chaque borne est écrite par une
règle de l'API — `BoostStatsRequest`, `StorePropertyVisitRequest`, `UpdatePropertyVisitRequest`,
`BookingRequestPublicPropertyRequest`, `Permissions/StoreRoleDelegationRequest`).

## Delta à produire

- [x] Statistiques de boost : « Au » de « Du » à demain (jour de l'API), et à 92 jours après « Du »
      au plus ; « Du » de 92 jours avant « Au » à « Au ».
- [x] « Planifier une visite » : jour au plus tôt le jour de l'API (heure de Dakar, UTC+0).
- [x] Replanification de l'agent : `min` à l'instant présent **à Dakar**, le champ se lisant à
      Dakar (`instantADakar`).
- [x] Offre d'achat : `minExpiry` = `decalerJour(jourDeLApi(), 1)` au lieu de `setDate()` local
      relu par `toISOString()`.
- [x] Délégations : `dateMax` = `decalerJour(jourDeLApi(), 366)`, même correction.
- [x] Tests : un fichier `…p230-05.test.tsx` par écran (cinq), et `heureMuraleADakar` dans
      `heure-de-dakar.test.ts`.

## Critères d'acceptation

- [x] AC1 — Boost, 01:00 Z le 25 octobre 2026 à New York : « Au » `max` 2026-10-26, `min` le « Du »
      par défaut ; « Du » au 1er juin → « Au » `max` 2026-09-01.
- [x] AC2 — « Planifier une visite », même instant : `min` 2026-10-25.
- [x] AC3 — Replanifier, même instant : `min` 2026-10-25T01:00 (21:00 le 24 au navigateur).
- [x] AC4 — Offre, 00:00 Z le 29 mars 2026 à Paris : `min` 2026-03-30 (et non le 29).
- [x] AC5 — Délégation, 23:00 Z le 8 mars 2026 à New York : `max` 2027-03-09 (et non le 10).

## Hors périmètre

- La minute courante des visites : un `datetime-local` ne grise que ce qui précède son `min`, la
  primitive de « Planifier une visite » n'a que le jour.
- Faire servir ces bornes par l'API : elles restent recopiées des règles, avec leur renvoi.

## Notes d'implémentation

- Le formulaire de replanification et celui de « Planifier une visite » sont en `noValidate` :
  leur `min` guide le sélecteur, sans bloquer l'envoi ; les tests existants qui saisissent des
  dates passées (`VisitDetail.test.tsx`, 2026-06-01) restent verts.
- L'heure de Dakar de la replanification passe par `heureMuraleADakar` (`heure-de-dakar.ts`,
  qui réutilise le décalage lu par `Intl`) : un `Intl.DateTimeFormat` de plus dans l'écran faisait
  monter le cliquet de `check-locale-figee.mjs`.
- `jourIso` de `CreateDelegationDialog` n'avait plus d'appelant : retiré.
- Ablation : les cinq fichiers de production rendus à `pre-dev` → 5/5 tests neufs rouges (dont
  `max="2027-03-10"` et `min="2026-03-29"`, les deux décalages mesurés par l'explorateur) ; remis →
  5/5 verts, et 76 tests existants des mêmes écrans verts.
