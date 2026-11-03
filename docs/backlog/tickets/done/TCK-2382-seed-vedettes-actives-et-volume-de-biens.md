---
id: TCK-2382
title: "Le seed montre des Vedettes en cours, et la préproduction sème environ 950 biens"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-26
updated: 2026-10-26
depends_on: [TCK-2379]
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#95-creditlot-"
    - "docs/models-spec.md#100-propertyboosttranche-"
tags: [api, seed, données, boosts, crédits, préproduction]
---

## Objectif utilisateur

Un visiteur de la préproduction voit des biens en Vedette dans chaque agence, et un catalogue à la
taille d'un marché réel.

## Contexte

Relevé de la préproduction juste après le reseed de TCK-2379 (2026-10-26) : **2 Vedettes actives**
sur 582 biens, contre 25 terminées. Les agences n'ont qu'un crédit de bienvenue de 500, valable
180 jours, et la plus grande un geste ponctuel de 300 : les achats s'arrêtent faute de crédits, et
les lots expirent avant aujourd'hui. Les 68 Vedettes en pause sont celles que
`LegacyFeaturedConversion` pose sur les biens de test (`is_test`).

Le porteur demande aussi environ 950 biens, contre 582 (dont 240 biens de test, 342 réalistes).

## Delta à produire

- [x] `BoostActivitySeeder` : des crédits mensuels du programme de lancement (`adminAdjust`, à la
      taille de l'agence, valables 45 jours) ; une campagne en cours, c'est-à-dire des Vedettes de 15
      ou 30 jours achetées ces dernières semaines sur des biens distincts ; les Vedettes offertes
      par la plateforme datées des derniers jours.
- [x] `SeedingFeatureTablesTest` : chaque agence `standard` a au moins 3 Vedettes actives.
- [x] Préproduction : `SEED_PROPERTIES_PER_AGENCY` réglé pour environ 950 biens réalistes, puis
      reseed.

## Critères d'acceptation

- [x] AC1 — Après un seed, chaque agence `standard` a au moins 3 Vedettes actives dont la fin est à
      venir, et le test rougit sans la campagne en cours.
- [x] AC2 — Invariants tenus : solde de crédits = Σ mouvements, tranches = total de chaque Vedette,
      une statistique par jour écoulé.
- [x] AC3 — La préproduction compte environ 950 biens réalistes (`is_test = false`) après son
      reseed, et le seed y tient dans la limite mémoire du conteneur (256 Mo pour PHP).

## Hors périmètre

- L'achat de crédits (phase 2, ADR-0061 §11).
- Les volumes de clients et de baux : ils restent à leur réglage de préproduction.

## Notes d'implémentation

**Mesuré en local**, le 2026-10-26, avec les réglages de la préproduction (3 agences, cas limites,
couverture des filtres, comptes de démo), médias coupés et PHP limité à 256 Mo :

| `SEED_PROPERTIES_PER_AGENCY` | Biens réalistes | Biens de test | Annonces publiques | Vedettes réalistes actives | Pic mémoire | Durée |
|---|---|---|---|---|---|---|
| 150 (préproduction actuelle)¹ | 342 | 240 | 161 | 2 | 183 Mo | 393 s |
| 415, crédits du mois à 120 | 917 | 240 | 609 | 28 | 194 Mo | 545 s |
| **430, crédits du mois à 60** | **950** | 240 | 617 | **22** | 194 Mo | 554 s |

¹ Avant ce ticket. Annonces publiques et Vedettes relevées sur la préproduction ; mémoire et durée
mesurées en local.

Le volume suit `propertiesPerAgency` × la taille de chaque agence (somme des tailles ≈ 2,2) : 430
rend exactement 950 biens réalistes. Les crédits ne limitaient pas les Vedettes : diviser les crédits
du mois par deux n'en retire que 6. La campagne en cours, si : sans elle, l'agence 2 tombe à 0 et
le test rougit (ablation jouée).

Les 68 Vedettes offertes sur des biens de test (`LegacyFeaturedConversion`) s'ajoutent aux
actives, mais la préproduction les met en pause : leurs biens ne sont pas publics.

## Clôture en préproduction (2026-10-26)

`SEED_PROPERTIES_PER_AGENCY=430` posé dans le Compose de l'API par `compose.update`, et relu sur
le serveur après le déploiement de `c9dcc333`. Avant le reseed : sauvegarde manuelle de
`takussan_preview` relue dans R2 (15:25 UTC), et les deux seaux de médias vidés (2 570 et 7 400
objets). Seed de 15:50 à 17:40 UTC, sortie 0, invariants tenus.

Relevé après le seed :
- **950 biens réalistes**, plus 240 biens de test ;
- 625 annonces publiques, dont **26 en Vedette** (2 avant ce ticket) ;
- 4 982 photos téléchargées, 0 échec ;
- file `media` vide, aucun job en échec.
