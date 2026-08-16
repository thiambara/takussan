---
id: TCK-314
title: "Un test de recherche publique ne passe que grâce à l'ORDRE de la suite — et il rougit 3 fois sur 5 en parallèle"
status: todo
phase: P2
family: technique
estimate: S
wave: 38
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-recherche--decouverte
  models: []
tags: [back, tests, recherche, meilisearch, determinisme, dette]
---

## Objectif utilisateur

Qu'un test vert prouve que le code marche, et non que les tests ont été joués dans le bon ordre.

## Contrat de données

Aucune donnée applicative. **Mesuré le 2026-08-16**, sur `dev` (`e53ce847`), sans aucune
modification de code — le défaut préexiste à sa découverte :

`tests/Feature/Public/PropertyIsTestExclusionTest::test_public_search_excludes_is_test_properties`

| Comment il est lancé | Résultat |
|---|---|
| Suite complète, séquentielle (2313 tests) | ✅ **passe** — deux exécutions indépendantes |
| `--filter=PropertyIsTestExclusionTest`, seul | ❌ **échoue**, de façon déterministe |
| `--filter='PublicPropertySearchFiltersTest\|PropertyIsTestExclusionTest'` | ❌ **échoue** |
| Suite complète sous `--parallel` (5 exécutions) | ❌ **échoue 3 fois sur 5** |

Message : `Failed asserting that an array contains 'Searchable Real'`
(`tests/Feature/Public/PropertyIsTestExclusionTest.php:40`).

## Contexte — pourquoi ce n'est pas un test capricieux mais un trou de preuve

`/api/public/properties/search` lit **directement l'index Meilisearch** :
`App\Services\Search\PropertySearchService::search()` appelle `Property::search(...)->raw()` et
hydrate les `hits`. Il n'y a **aucun repli** sur Eloquent.

Or `PropertyIsTestExclusionTest` **ne porte pas** `Tests\Concerns\InteractsWithMeilisearch`, et
`Tests\TestCase::setUp()` coupe la synchronisation Scout pour toute la suite (correctif D-44). Le
bien créé par ce test ne devrait donc **jamais** atteindre l'index — et le test ne devrait
**jamais** passer. Il passe pourtant dans la suite complète, ce qui veut dire qu'un état laissé par
un test antérieur du **même processus** le fait passer.

**C'est le pire profil : un test vert qui ne prouve rien.** Tant qu'il est vert, la règle métier
qu'il prétend garder — *un bien `is_test` ne doit jamais atteindre la surface publique* (TCK-163) —
n'est en réalité vérifiée par personne. Le mécanisme exact de la dépendance n'a pas été identifié et
**c'est la première chose à faire** : le nommer avant de corriger, sinon on déplace la dépendance au
lieu de la supprimer.

Découvert en éprouvant `--parallel` pour [TCK-302](TCK-302-couverture-non-mesuree-suite-non-parallelisee.md).
ParaTest redistribue les tests entre les workers, ce qui casse l'ordre accidentel : le défaut se
manifeste alors 3 fois sur 5. **Il bloque la parallélisation** — pas l'inverse.

## Delta à produire

- [ ] **Nommer le mécanisme** : quel état d'un test antérieur rend celui-ci vert ? (piste à
      infirmer ou confirmer : `disableSearchSyncing()` / `enableSearchSyncing()` sont des états
      **statiques** de `Laravel\Scout\ModelObserver`, et `Tests\Support\SearchableModels::all()`
      est la liste sur laquelle `TestCase::setUp()` boucle)
- [ ] Rendre le test **autoportant** — il indexe ce qu'il interroge, donc il porte
      `InteractsWithMeilisearch` et appelle `indexProperties()` avant d'interroger l'endpoint
- [ ] Chercher les **autres** tests qui interrogent une surface de recherche sans porter le concern :
      le même trou peut exister ailleurs et se voir aussi peu
- [ ] Prouver la correction par **ablation** : le test corrigé doit passer SEUL, et échouer si l'on
      retire l'indexation qu'on vient d'ajouter

## Critères d'acceptation

- [ ] AC1 — `php artisan test --filter=PropertyIsTestExclusionTest` passe, lancé seul
- [ ] AC2 — la suite complète séquentielle reste à 0 échec
- [ ] AC3 — le mécanisme de la dépendance à l'ordre est écrit, pas seulement contourné
- [ ] AC4 — si d'autres tests présentent le même trou, ils sont listés (corrigés ici ou ticketés)

## Hors périmètre

- La parallélisation elle-même — TCK-302.
- Le seuil de couverture — TCK-302.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder.)_
