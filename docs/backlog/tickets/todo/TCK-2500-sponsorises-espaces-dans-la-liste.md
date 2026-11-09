---
id: TCK-2500
title: Sponsorisés espacés : un en tête de page, puis un toutes les dix cartes
status: todo
phase: P1
family: full
estimate: S
wave: 84
created: 2026-11-08
updated: 2026-11-08
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [back, front, boost, search, audit-ux]
---

## Objectif utilisateur

Le chercheur lit d'abord des résultats, pas une rangée de publicité, et l'annonceur garde une place vue en tête.

## Contrat de données

Liste publique : la réponse porte déjà `sponsored` à côté de `data` ([ADR-0061](../../../adr/0061-credits-d-espace-et-boost-des-annonces.md), `SponsoredRotation`). Ajout : chaque sponsorisé porte sa position d'insertion `position` (0 = tête, puis 11, 22… dans la suite des cartes affichées), calculée par l'API.

## Contraintes strictes (métier)

- Une vedette en tête de la page, puis une toutes les dix cartes, jamais deux de suite, sans doublon avec les résultats organiques de la page.
- Le réglage `boost.sponsored_slots_per_page` reste le plafond par page (0 = aucun).
- La rotation horaire et la graine de `SponsoredRotation` ne changent pas ; les statistiques d'affichage (`BoostStatsRecorder`) comptent une vedette affichée, quelle que soit sa position.

## Delta à produire

- [x] `PropertySearchService` : positions d'insertion des sponsorisés.
- [ ] Front de la liste : insertion à la position rendue, mention sobre « Sponsorisé ».
- [ ] Tests : `SponsoredPlacementTest` (tête, puis tous les dix, plafond, page sans sponsorisé) ; test front d'insertion.

## Critères d'acceptation

- [x] AC1 — Avec trois vedettes éligibles et un plafond de 3, une page de 40 biens montre une vedette en position 1, 12 et 23.
- [x] AC2 — Avec le plafond à 0, aucune vedette.
- [x] AC3 — Une vedette n'apparaît jamais aussi comme résultat organique de la même page.

## Hors périmètre

- La rangée vedette de l'accueil (règle inchangée).
- La tarification du boost.

## Notes d'implémentation

Partie back faite le 2026-11-09 (vague 1, agent « recherche ») ; le front (insertion, mention « Sponsorisé », test
front) reste à faire — les cases AC portent sur le contrat de l'API (`SponsoredPlacementTest`).

Contrat exposé (`GET /api/public/properties/search`) :

- `sponsored` reste à côté de `data`, hors pagination et hors `total` ; chaque entrée porte désormais **`position`** :
  son rang (base 0) dans la suite des cartes AFFICHÉES une fois les emplacements insérés — `0`, `11`, `22`, `33`…
  (`PropertySearchService::CARTES_ENTRE_EMPLACEMENTS = 10`). Le front insère `sponsored[k]` à l'index `position` de la
  suite `data` + emplacements, dans l'ordre de `sponsored` : `[S0, d0…d9, S1, d10…d19, S2, d20…]`.
- **Jamais deux de suite** : le k-ième emplacement n'est servi que si la page porte au moins k × 10 cartes (`data`,
  places réservées comprises) — une page de moins de dix cartes n'en montre qu'un, en tête. Le front n'a donc jamais à
  tronquer ni à recalculer : toute `position` rendue tombe dans la suite.
- **Aucun doublon** : une vedette déjà parmi les cartes de `data` n'est pas servie en emplacement ; la suivante dans la
  même rotation prend sa place (`SponsoredRotation::pickExcluding()` : même mélange, même tranche, même graine — sans
  exclusion, c'est `pick()`, épinglé par `SponsoredRotationPickTest`). La carte garde sa place organique.
- Plafond : `boost.sponsored_slots_per_page` (0 : aucun). Impressions : une par emplacement réellement servi, quelle que
  soit sa position (`BoostStatsRecorder`, appelé après le placement).

Décisions non évidentes :

- **AC3 amende ADR-0061 §7** (« un bien sponsorisé garde sa place organique en dessous » : il y paraissait DEUX fois).
  Lu ici sans contredire la phrase : la carte organique garde sa place, c'est l'emplacement qui passe à la vedette
  suivante. Conséquence assumée : sur une petite recherche dont toutes les vedettes tiennent dans la page, il n'y a plus
  d'emplacement. Les tests qui servaient en emplacement un bien aussi présent dans la page (`SponsoredRotationTest`,
  `SponsoredImpressionsTest`, `RobotImpressionsTest`, `AccueilSansEmplacementsTest`,
  `LegacyFeaturedConversionIndexTest`) ont été réécrits pour une page qui ne le porte pas ; leur propriété est
  inchangée.
- Les places réservées (page 1) restent calculées sur la tranche de `pick()` : la pagination qu'elles décalent ne bouge
  pas d'une page à l'autre.
- Revue adverse (2026-11-09) — deux angles morts fermés : `SponsoredImpressionsTest::test_une_vedette_seulement_organique_ne_compte_aucune_impression`
  (impressions comptées sur la tranche de `pick()` au lieu des emplacements servis : rouge) et
  `SponsoredPlacementTest::test_un_plafond_au_moins_egal_au_vivier_sert_toutes_les_vedettes` (50 cartes sans vedette,
  plafond 10 ≥ vivier 3 : les 3 servies en 0/11/22 ; ablations « une de moins » dans `pickExcluding` et vivier limité à
  2 : rouges) — il remplace le constat « slots=10 sert toutes les vedettes » retiré de `SponsoredRotationTest`.
- [x] Delta specs fait par la session (2026-11-09) : `docs/features.md` § 1.2 (emplacements) et § 2.4 (`sponsored[].position`, règle côté API ; l'insertion front reste à livrer).
