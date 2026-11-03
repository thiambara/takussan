---
id: TCK-1990
title: "Chemins fermés aux agents, traités en session : APP_DEBUG=false dans la suite, relevé Scout de préproduction, règle de réindexation"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [api, tests, recherche, infra, pistes]
---

## Contexte

Réfs : **P156.03**, **P123.03** et **P122.04** du fichier de pistes, tranchées par le porteur le
2026-10-23. Leur correctif passe par des fichiers que les agents ne modifient pas (`phpunit.xml`,
`.env.docker`, `docs/infra/`, `takussan-api/CLAUDE.md`) : ils sont traités en session.

## Delta à produire

- [x] **P156.03** — `phpunit.xml` pose `APP_DEBUG=false`, comme la préproduction : la suite éprouve le
  corps d'un 500 sans trace. Les régimes de cache, de file, de session et de Scout de la suite sont
  commentés, sans changement de valeur.
- [x] **P123.03** — le relevé Scout de la préproduction (`SCOUT_QUEUE=true`,
  `SCOUT_AFTER_COMMIT=true`, Dokploy, 2026-10-22) est écrit dans `docs/infra/hebergement.md` et
  `docs/infra/prod-drivers.json`. `.env.docker` dit le 500 qu'un Meilisearch coupé produit en
  développement. Le porteur n'a pas voulu de code (option a) : la préproduction indexe en file
  après le commit.
- [x] **P122.04** — `takussan-api/CLAUDE.md` § Recherche : une migration qui réécrit une colonne
  indexée réimporte son modèle. Le reste (réindexer les biens de `LegacyFeaturedConversion`)
  revient à l'implémenteur.

## Critères d'acceptation

- [x] AC1 — dans la suite, `config('app.debug')` vaut `false`, même avec un `.env` à `true`
  (sonde temporaire, retirée).
- [x] AC2 — les 13 fichiers qui attendent un 500 restent verts (128 tests) ; la CI joue la suite
  entière.

## Hors périmètre

- Changer `SCOUT_QUEUE` en développement ou dans la suite (décision du porteur).
