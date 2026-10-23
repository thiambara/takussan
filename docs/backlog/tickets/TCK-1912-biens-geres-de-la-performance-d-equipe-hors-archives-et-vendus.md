---
id: TCK-1912
title: "« Biens gérés » de la performance d'équipe ne compte plus les biens archivés ni vendus"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#25-reporting--tableaux-de-bord"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-198--un-même-mot-compté-par-des-règles-différentes-dun-écran-à-lautre"
tags: [api, reporting, agent, pistes]
---

## Objectif utilisateur

L'admin d'agence lit, dans la colonne « Biens gérés » de la performance d'équipe, le même nombre
que l'agent voit sous « Biens gérés » à son accueil.

## Contexte

Réf : **P198.04** du fichier de pistes, `validé (délégué)` (V7 accordé).

Depuis TCK-1359, les « Biens gérés » de l'accueil de l'agent écartent
`Property::OUT_OF_PORTFOLIO_STATUSES` (`archived`, `sold`). La colonne `properties_managed` de
`TeamPerformanceService` comptait encore tous les statuts : un agent avec un bien vendu ou archivé
y avait plus de biens qu'à son accueil.

## Décision du porteur (déléguée)

la colonne « Biens gérés » de la performance d'équipe (`TeamPerformanceService`, `properties_managed`) écarte `Property::OUT_OF_PORTFOLIO_STATUSES` (`archived`, `sold`), comme l'accueil de l'agent depuis TCK-1359 ; test : un bien `sold` et un `archived` d'un agent ne comptent ni dans son accueil ni dans sa ligne de performance

## Contrat de données

`GET /api/agencies/{agency}/team-performance` : `data.agents[].properties_managed` — sens
changé, forme inchangée.

## Contraintes strictes (métier)

- Le portefeuille est celui de TCK-1359 : hors `archived` et `sold`, `draft`, `pending_review`
  et `rejected` gardés. La règle se lit sur `Property::OUT_OF_PORTFOLIO_STATUSES`, jamais recopiée.
- Les deux branches de l'UNION (biens possédés, collaborations `agent|manager`) l'appliquent.

## Delta à produire

- [x] `App\Services\Reporting\TeamPerformanceService` : `$owned` et `$collaborated` écartent
      `Property::OUT_OF_PORTFOLIO_STATUSES`.
- [x] `TeamPerformanceTest::test_p198_04_sold_and_archived_properties_are_managed_neither_on_the_home_nor_in_the_team_line`.

## Critères d'acceptation

- [x] AC1 — Un agent possède un bien `available`, un `draft`, un `sold`, un `archived`, et
      collabore (`agent`) sur un `available`, un `sold`, un `archived` : sa ligne de performance
      d'équipe rend `properties_managed = 3`, son `/api/dashboard/agent` et son `/api/dashboard/me`
      aussi.

## Reste à faire

le « Biens » de l'accueil d'agence (`properties.total`) et `properties_count` de `GET /api/agencies/{id}/stats`, et l'écriture de la définition du portefeuille dans `docs/features.md`

## Hors périmètre

- Le « Biens » de l'accueil d'agence et `properties_count` des stats d'agence (reste ci-dessus).
- `tasks_overdue` de la même classe : P198.01, traité ailleurs (PR #1348).

## Notes d'implémentation

- Ablation : correctif retiré, le test rend `Failed asserting that 7 is identical to 3` (les
  sept biens comptés) ; remis, 9 tests verts sur `TeamPerformanceTest`.
- Le test pose les biens sortis du portefeuille sur les **deux** branches de l'UNION : n'en filtrer
  qu'une rendrait 5.
