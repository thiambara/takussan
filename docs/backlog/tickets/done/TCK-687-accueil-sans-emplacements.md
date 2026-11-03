---
id: TCK-687
title: "Rangée « À vendre » de l'accueil : paramètre placements=false, aucun emplacement ni impression"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-18--statistiques-boost-face-aux-robots-aux-rendus-serveur-et-aux-revalidations
tags: [api, front, boost, search, pistes]
---

## Contexte

Réf : **P18.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

La rangée « À vendre » de l'accueil est lue par le serveur sur
`GET /api/public/properties/search?contract_type=sale&per_page=12`, dont elle n'affiche que `data`.
Ce endpoint tire toujours les emplacements en régime strict (ADR-0061 § 7) : il compte une
impression par bien de `sponsored` (ADR-0061 § 10), que la rangée ne montre jamais, et place en
tête de `data` des vedettes `placement: "reserved"` que la rangée présente sans robe, comme des
résultats organiques.

### Décision du porteur

> paramètre qui coupe les emplacements (aucune impression) pour la rangée de l'accueil

## Objectif utilisateur

Le visiteur de l'accueil ne voit aucune place payée présentée comme organique, et l'annonceur ne
paie pas en impressions des emplacements jamais montrés.

## Contrat de données

- `GET /api/public/properties/search` accepte `placements` (booléen, `true` par défaut). À
  `false` : ni `sponsored`, ni place réservée (`data` tout `organic`), ni impression comptée.
  `meta` et `facets` sont inchangés.
- La carte (`/map`) refuse la clé, comme les autres clés propres à la liste.

## Contraintes strictes (métier)

- Sans le paramètre, ou à `true`, la réponse et la rotation (graine) sont celles d'avant.
- Une valeur non booléenne rend 422 (même normalisation que `furnished` et `featured`).

## Delta à produire

- [x] `SearchPublicPropertyRequest` : règle `placements` `nullable|boolean`, normalisée.
- [x] `PropertySearchService::search()` : pas d'appel à `placements()` quand `placements=false` ;
      la clé est retirée de la graine de rotation.
- [x] `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` et son miroir front.
- [x] Front : `raccourcis-de-l-accueil.ts` envoie `placements=false`.
- [x] Tests : `AccueilSansEmplacementsTest` (témoin, coupure, 422), `raccourcis-de-l-accueil.test.ts`,
      listes de `search-filters.parity.test.ts`.

## Critères d'acceptation

- [x] AC1 — `?contract_type=sale&per_page=12&placements=false`, avec vedettes et réglages qui en
      servent : `sponsored = []`, toute ligne de `data` est `organic`, aucune impression comptée.
- [x] AC2 — la même requête sans le paramètre sert toujours un emplacement et compte (témoin).
- [x] AC3 — `placements=peut-etre` rend 422.
- [x] AC4 — l'accueil demande la rangée « À vendre » avec `placements=false`.

## Hors périmètre

- Les autres points de l'entrée P18.01 que la décision ne tranche pas : la question des
  impressions des places réservées sur `/properties` (ADR-0061 § 10), et `/playground` (P18.06).
- La rangée vedette de l'accueil (P18.02, P18.03) et le filtrage des robots (P18.04).

## Notes d'implémentation

- **Ablation API** : retirer `&& $avecEmplacements` de `PropertySearchService::search()` →
  `test_placements_false_ne_sert_aucun_emplacement_et_ne_compte_rien` rouge (`sponsored` non vide),
  témoin et 422 verts ; remis → 3 verts. **Ablation front** : retirer `&placements=false` de
  `raccourcis-de-l-accueil.ts` → 1 rouge ; remis → vert.
- **Piège** : la carte hérite des règles de la liste. La clé neuve doit entrer dans
  `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` **et** dans son miroir front, sinon
  `MapFiltersParityTest` et `search-filters.parity.test.ts` rougissent ; elle figure aussi dans
  `HORS_INTERFACE` et `NON_FILTRANTES` de ce dernier : ce n'est pas un filtre du panneau.
- `placements` est retiré des `$params` avant la graine de rotation : `placements=true` sert la
  même rotation que l'absence du paramètre.
