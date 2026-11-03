---
id: TCK-974
title: "Tout processus de test supprime ses index `testing_<jeton>_*`, et non le seul processus qui porte `InteractsWithMeilisearch`"
status: done
phase: P2
family: technique
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-53--index-meilisearch-testing_-et-smoke_-laissés-sur-linstance-docker-locale"
tags: [back, tests, search, meilisearch, harnais, pistes]
---

## Objectif utilisateur

Un développeur ou un agent qui lance des tests sans test de recherche ne laisse plus d'index
Meilisearch derrière lui sur l'instance locale.

## Contexte

Réf : **P53.01** du fichier de pistes, `retenu · autonome` (A1 + A5). Le comportement attendu est
écrit dans le docblock de `Tests\Support\TestSearchIndex` : les index créés par une exécution
doivent être supprimés en fin d'exécution.

Mesuré avant correctif (2026-10-19, `pre-dev` 22da7f13d) : `php artisan test
tests/Feature/Api/PropertyTagsTest.php` → 8 verts, et `testing_29296c0bc4_properties` reste sur
l'instance du port 7701 après la fin du processus. La suppression n'était programmée que par
`InteractsWithMeilisearch`, alors que `disableSearchSyncing()` ne coupe que l'observateur de
modèle : un `->searchable()` explicite de `app/` crée l'index quand même.

## Hypothèses (mode sans humain)

- Le balayage des orphelins (une lecture de `GET /indexes`) tourne désormais une fois dans chaque
  processus de test, et non plus au seul premier test de recherche. Son coût est une requête par
  processus ; un moteur absent est déjà toléré (`Throwable` avalé).

## Delta à produire

- [x] `Tests\TestCase::setUp()` programme `TestSearchIndex::registerCleanup()` pour tout processus.
- [x] `InteractsWithMeilisearch` ne le programme plus lui-même ; docblocks du concern et de
  `TestSearchIndex` corrigés (le concern n'est pas le seul à écrire).
- [x] `TestSearchIndex::cleanupIsRegistered()`, lu par le test.
- [x] Test : `tests/Unit/Testing/SearchIndexCleanupTest.php`.

## Critères d'acceptation

- [x] AC1 — un test sans le concern, joué dans un processus à lui, trouve le nettoyage programmé.
- [x] AC2 — `PropertyTagsTest`, `TagVisibilityTest` et `BoostPauseAndRefundTest` lancés ensemble ne
  laissent aucun index `testing_*` neuf sur l'instance.

## Hors périmètre

- Le seuil d'âge et la pagination du balayage : P53.04 (ticket à part).
- Les index `testing_<modèle>` de `dev.sh` (P53.02) et `smoke_*` (P53.03) : chemins fermés.

## Notes d'implémentation

- Le test tourne en `#[RunInSeparateProcess]` : dans un processus partagé, un test de recherche
  joué avant aurait déjà programmé le nettoyage par le concern, et le vert ne prouverait rien.
- Ablation : l'appel de `TestCase::setUp()` neutralisé → `SearchIndexCleanupTest` rouge (1 échec),
  et `PropertyTagsTest` laisse à nouveau `testing_2d3797f982_properties` ; remis → vert, et plus
  aucun index neuf.
