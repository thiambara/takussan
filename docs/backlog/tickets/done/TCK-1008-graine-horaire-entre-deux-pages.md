---
id: TCK-1008
title: "Les pages suivantes de la recherche gardent l'heure de graine de la page 1"
status: done
phase: P1
family: bug
estimate: M
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
tags: [api, front, search, boost, pistes]
---

## Contexte

Réf : **P55.01** du fichier de pistes, `validé` par le porteur (V7 accordé). Les places réservées
de la page 1 se recalculent à chaque page (`PropertySearchService::placements()`), et la graine de
rotation porte l'heure UTC (`SponsoredRotation::seed()`) : quand l'heure change entre la page 1 et
la page 2, l'emplacement de la page 1 change, donc l'ensemble des places réservées aussi, et la
page 2 exclut d'autres biens que ceux que la page 1 a montrés en tête. L'ADR-0061 § 7 écrit que le
bien d'une place réservée « n'apparaît pas une seconde fois plus bas dans la page 1 ni dans les
suivantes ». Re-mesuré le 2026-10-19 sur `pre-dev` 1c1fe5f0f par le test de garde : page 1 à hh:59,
pages 2 et 3 à hh+1:00 → 19 heures sur 24 donnent un doublon et un absent.

## Décision du porteur

> la seconde voie : le front transmet aux pages suivantes l'heure de graine de la page 1, que l'API n'accepte que si elle vaut l'heure courante ou la précédente (sinon elle prend l'heure courante, comme aujourd'hui) ; ADR-0061 § 7 inchangé ; le test garde-fou des pages 1, 2 et 3 à hh:59 puis hh+1:00 (porteur, 2026-10-19, sur la recommandation du délégué) ; reste : le vivier qui change entre deux pages (`boosts:tick`), à mesurer

## Reste à faire

> le vivier qui change entre deux pages (`boosts:tick`), à mesurer

## Objectif

Une page 2 ou 3 servie après le changement d'heure complète la page 1, sans doublon ni absent.

## Delta à produire

- [x] API — `PropertySearchService::search()` lit `seed_hour` (`Y-m-d\TH`, UTC), ne l'accepte que
      si elle vaut l'heure courante ou la précédente (sinon l'heure courante), la retire de la
      graine de filtres, la passe à `SponsoredRotation::seed()` et la rend à la racine de la
      réponse (`seed_hour`).
- [x] API — `SearchPublicPropertyRequest` laisse passer `seed_hour` (chaîne, jamais de 422) ;
      `MapPublicPropertyRequest::CLES_PROPRES_A_LA_LISTE` la compte parmi les clés de la liste.
- [x] Front — `SearchResult.seed_hour` ; `Pagination` l'écrit dans les liens des pages 2 et
      suivantes (`heureDeGraine`, passée par `PropertiesDiscoveryPage`) ;
      `CLES_PROPRES_A_LA_LISTE` (miroir) la compte.
- [x] Tests — `ReservedTopResultsAcrossHoursTest` (API) et
      `PropertiesDiscoveryPage.heure-de-graine.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — pour chacune des 24 heures d'une journée, page 1 à hh:59 puis pages 2 et 3 à hh+1:00
      avec la `seed_hour` de la page 1 : l'union des identifiants vaut `total`, sans doublon.
- [x] AC2 — une `seed_hour` plus ancienne que l'heure précédente, future ou illisible est ignorée :
      la réponse est celle de l'heure courante ; l'heure précédente est acceptée.
- [x] AC3 — la route publique transmet `seed_hour` jusqu'au service et la rend.
- [x] AC4 — les liens des pages 2 et suivantes portent la `seed_hour` de la réponse affichée ; le
      lien de la page 1 garde la forme canonique ; une réponse sans `seed_hour` n'écrit rien.

## Hypothèses (mode sans humain)

- Nom et forme du paramètre : `seed_hour`, heure UTC `2026-10-19T16`, à la racine de la réponse
  à côté de `sponsored`. La décision ne les fixe pas ; c'est la forme la plus lisible dans une URL.
- Une `seed_hour` hors borne ne rend pas 422 : la décision dit « sinon elle prend l'heure
  courante », et un lien partagé ou un onglet oublié ne doit pas casser la recherche.
- Le lien de la page 1 ne porte pas l'heure (« aux pages suivantes », et la forme canonique de
  TCK-557) : un retour en page 1 après le changement d'heure la recalcule à l'heure courante.

## Hors périmètre

- Le vivier qui change entre deux pages (`boosts:tick`) : reste du porteur, non mesuré.
- `useSearch.setPage()`, sans appelant sur `/properties` (la pagination est faite de liens).

## Notes d'implémentation

- Rouge avant correctif, pour la bonne raison : l'API rendant déjà `seed_hour` mais l'ignorant en
  entrée, 19 heures sur 24 donnaient un doublon et un absent (ex. 00:59 → `f2,f3,o1,o2 | o3,o4,o5,o6 | f3`).
- Ablation API : `heureDeGraine()` réduite à l'heure courante → 3 rouges (les 19 heures, l'heure
  précédente refusée, la route) ; correctif remis → 3 verts. Ablation front : la ligne de
  `Pagination` qui écrit `seed_hour` retirée → 2 rouges sur 3 ; remise → 3 verts.
