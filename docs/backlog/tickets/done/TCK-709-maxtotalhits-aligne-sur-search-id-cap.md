---
id: TCK-709
title: "Les index Meilisearch servent 5000 résultats, le plafond que SEARCH_ID_CAP demande"
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
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-1--recherche-dun-bien
tags: [api, search, meilisearch, pistes]
---

## Contexte

Réf : **P01.06** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`HasQueryBuilder::SEARCH_ID_CAP` demande 5000 identifiants à Meilisearch (`take(5000)`), et
`takussan-api/CLAUDE.md` annonce ce plafond. Mais aucun index ne déclare
`pagination.maxTotalHits`, dont le défaut Meilisearch est 1000 : le plafond réel est 1000, en
silence, et la pagination publique (40 par page) s'arrête à la page 25.

## Décision du porteur

maxTotalHits = 5000, aligné sur SEARCH_ID_CAP

## Objectif

Chaque index Meilisearch du dépôt déclare `pagination.maxTotalHits = 5000`, la valeur de
`SEARCH_ID_CAP`.

## Delta à produire

- [x] `config/scout.php` : `'pagination' => ['maxTotalHits' => 5000]` dans les `index-settings`
      des sept modèles indexés (une seule valeur, déclarée en tête du fichier).
- [x] Test `tests/Feature/Search/SearchIdCapIndexSettingsTest.php` : lit le réglage sur les index
      du processus après `scout:sync-index-settings`, et le compare à `SEARCH_ID_CAP`.

## Critères d'acceptation

- [x] AC1 — Après `scout:sync-index-settings`, chaque index de `SearchableModels::all()` rend
      `maxTotalHits = 5000`, égal à `SEARCH_ID_CAP`.
- [x] AC2 — Le plafond de `MessagingContactController` reste égal à `SEARCH_ID_CAP`.

## Hypothèses (mode sans humain)

- La décision vaut pour les sept index, pas pour celui des biens seul : `SEARCH_ID_CAP` sert
  `filter[search]` de tout modèle indexé (`HasQueryBuilder`), et `MessagingContactController`
  demande 5000 identifiants à l'index des utilisateurs.
- Le réglage atteint les environnements déployés par `scout:sync-index-settings`, que
  `docker/release.sh` lance déjà à chaque déploiement : aucun chemin de déploiement n'est touché.

## Hors périmètre

- `takussan-api/CLAUDE.md` n'est pas modifié : il annonce déjà 5000, ce qui devient vrai.
- La troncature silencieuse au-delà de 5000 (aucun compteur tronqué) reste telle quelle.

## Notes d'implémentation

- Ablation : `config/scout.php` remis à sa version de `pre-dev` → AC1 rouge, « Failed asserting
  that 1000 is identical to 5000 » ; correctif remis → 2 verts.
- `config/` est un déclencheur dur de `bin/impacted-tests.php` (suite entière) : remplacé
  localement par les classes de recherche qui synchronisent les réglages ; la CI joue la suite.
