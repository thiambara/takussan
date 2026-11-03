---
id: TCK-983
title: "Une page au-delà de la dernière ne sert ni ne compte d'emplacement « Sponsorisé »"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-55--places-réservées-et-emplacements-entre-deux-pages-de-la-recherche"
tags: [api, search, boost, pistes]
---

## Contexte

Réf : **P55.02** du fichier de pistes, `retenu · autonome` (A1). `PropertySearchService::placements()`
ne regardait que `totalHits > 0`, qui porte sur toute la recherche : au-delà de `last_page`, il
tirait quand même la tranche p des emplacements (la rotation boucle sur le vivier) et en comptait
les impressions, alors que le front rend `SearchEmpty` sans emplacement sur une liste vide.
Le contrat est écrit dans le code (« une impression ne se compte que pour un emplacement montré »,
TCK-687) et dans l'ADR-0061 § 10 (« une impression par bien réellement servi »).
Re-mesuré le 2026-10-19 sur `pre-dev` c164b2d8c par le test de garde : `per_page=1&page=4` sur
trois biens (`last_page` 3) → `data` vide, `sponsored` = le bien en vedette, une impression comptée.

## Objectif

Une page au-delà de la dernière rend `sponsored: []` et ne compte aucune impression.

## Delta à produire

- [x] `PropertySearchService::placements()` : rendre `[$organic(), []]` quand `$page` dépasse
      `totalPages` du résultat nominal, avant de lire le vivier.
- [x] `tests/Feature/Boost/SponsoredImpressionsTest.php` : page `last_page + 1` → `data` et
      `sponsored` vides, aucune impression ; témoin `page = last_page` → l'emplacement est servi
      et compté.

## Critères d'acceptation

- [x] AC1 — `page = last_page + 1` → `sponsored = []`, compteur d'impressions inchangé.
- [x] AC2 — `page = last_page` → l'emplacement est servi et compté (inchangé).

## Hypothèses (mode sans humain)

- `totalPages` du résultat nominal reste juste avec des places réservées : elles sont un
  sous-ensemble du résultat nominal (mesure de l'explorateur, angle 55).

## Hors périmètre

- P55.01 (graine horaire entre deux pages) : `retenu · à valider`, choix du porteur.

## Notes d'implémentation

- Avant correctif : 1 rouge sur 5 (`sponsored` contenait le bien). Ablation : service remis à sa
  version de `pre-dev` → le même rouge ; correctif réappliqué → 5 verts.
