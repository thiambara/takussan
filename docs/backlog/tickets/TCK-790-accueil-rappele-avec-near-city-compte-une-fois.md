---
id: TCK-790
title: "Garder par un test que l'accueil rappelé avec near_city ne compte qu'une impression vedette"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations"
tags: [back, boost, statistiques, test, pistes]
---

## Contexte

Réf : **P18.03** du fichier de pistes, `validé` (critère accordé : V7). Le rendu serveur de
l'accueil appelle `GET /api/public/properties/discovery` sans ville, puis le client le rappelle
avec `near_city` quand il devine la ville du visiteur. Mesuré le 2026-10-15 : la rangée vedette,
affichée une fois, comptait deux impressions. Depuis, TCK-708 (P01.04) dédoublonne les
impressions par visiteur et par bien sur 30 min (`CountBoostImpressions`).

## Décision du porteur

couvert par la déduplication de P01.04 ; un test : deux appels, l'un avec near_city, comptent une fois

## Delta à produire

- [x] Un test dans `tests/Feature/Boost/SponsoredImpressionsTest.php` : deux appels de l'accueil
      par le même visiteur, le second avec `near_city`, comptent une impression.

## Critères d'acceptation

- [x] AC1 — Accueil sans ville puis `?near_city=Dakar`, même IP : une impression sur le boost
      vedette, et le second appel sert bien le bien sponsorisé.

## Hors périmètre

- Tout changement de code : la décision constate que TCK-708 couvre le défaut.
- Le cas où le rendu serveur et le client n'ont pas la même IP vue par l'API (le rendu serveur
  appelle depuis le serveur du front) : non mesuré ici, voir le rapport du passage.

## Notes d'implémentation

- Le test est vert sans correctif, comme la décision l'annonce. Ablation : le dédoublonnage par
  visiteur de `BoostStatsRecorder::commitImpressions()` neutralisé → rouge (`2` au lieu de `1`) ;
  remis → vert.
