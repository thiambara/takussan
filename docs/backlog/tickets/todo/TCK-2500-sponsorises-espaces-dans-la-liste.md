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

- [ ] `PropertySearchService` : positions d'insertion des sponsorisés.
- [ ] Front de la liste : insertion à la position rendue, mention sobre « Sponsorisé ».
- [ ] Tests : `SponsoredPlacementTest` (tête, puis tous les dix, plafond, page sans sponsorisé) ; test front d'insertion.

## Critères d'acceptation

- [ ] AC1 — Avec trois vedettes éligibles et un plafond de 3, une page de 40 biens montre une vedette en position 1, 12 et 23.
- [ ] AC2 — Avec le plafond à 0, aucune vedette.
- [ ] AC3 — Une vedette n'apparaît jamais aussi comme résultat organique de la même page.

## Hors périmètre

- La rangée vedette de l'accueil (règle inchangée).
- La tarification du boost.

## Notes d'implémentation

_(à remplir par implementing-specs)_
