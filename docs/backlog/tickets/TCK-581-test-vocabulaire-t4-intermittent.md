---
id: TCK-581
title: "Le test « T4 » du vocabulaire dérivé rougit une fois sur quelques centaines : la référence aléatoire du bien est complétée par préfixe"
status: doing
phase: P1
family: bug
estimate: S
wave: 69
created: 2026-09-25
updated: 2026-09-25
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [tests, recherche, meilisearch, intermittent, ci]
---

# TCK-581 — Le test « T4 » rougit par intermittence

## Constat

`Tests\Feature\Search\PropertyDerivedVocabularyTest::test_t4_quatre_pieces_et_trois_chambres_salon_rendent_le_meme_ensemble`
a rougi deux fois en CI, **sur des diffs qui ne touchaient aucun fichier d'API**, et reverdi à la
relance :

| Date | Run | Contexte |
|---|---|---|
| 2026-09-13 | 34791093861 | merge #264 |
| 2026-09-24 | 36020248665 | promotion #310 (dev → preview) |

Même assertion à chaque fois : `q=T4` rend **un id en trop**, la fixture `villa_r1` (8ᵉ du corpus,
4 chambres, R+1) — jamais un id manquant.

## Cause — confirmée par reproduction déterministe

`Property::booted()` pose `reference_number = 'TK-'.année.'-'.strtoupper(Str::random(6))`, et
`reference_number` est dans les `searchableAttributes` de l'index (`config/scout.php`). C'est le
**seul jeton aléatoire** du document de ce corpus : titres, descriptions et surfaces sont épinglés ;
les salles de bain sont indexées sans leur compte et « meublé » ne préfixe aucune requête (relu dans
`PropertyLabels`).

Or Meilisearch complète **le dernier mot** d'une requête par préfixe : un suffixe tiré en `T4…` fait
répondre le bien à `q=T4`. Probabilité ≈ 2/62 × 1/62 ≈ 1/1900 par bien, soit ~1/275 par exécution de ce test
(7 biens hors de l'ensemble attendu) — et les autres tests du fichier sont exposés de même sur
leurs propres derniers mots. C'est **la signature de D-44** que le même fichier documentait déjà pour la
surface de 150 m² (« 1 » matche « 150 »).

Mesuré le 2026-09-25 :

- forcer `'reference_number' => 'TK-2026-T4QZXW'` sur `villa_r1` → le test rougit **à coup sûr**,
  `q=T4 … + 2 => 8` (l'id de `villa_r1`), exactement le rouge de CI ;
- sans ce forçage → vert.

## Correctif

`publier()` — le seul chemin de création du fichier — épingle `reference_number` à
`TK-2026-%06d` d'un compteur par test : chiffres seuls, zéros de tête, donc préfixe d'**aucun** mot
de requête du fichier. Unique dans le test (la colonne l'exige), et une valeur explicite passée à
`publier()` prime toujours. Le motif est écrit en tête du helper, à côté de la note D-44.

## Critères d'acceptation

- [x] **AC1 — le correctif ferme le défaut.** Ablation déterministe : `Str::createRandomStringsUsing`
      forcé à des chaînes distinctes préfixées `T4` (`T40001XX…`, `T40002XX…`) —
      **sans** le correctif, `test_t4_…` et lui seul rougit, sur `q=T4` (10 passés, 1 échoué) ;
      **avec**, 11 passés / 49 assertions.
      *Une régression le cocherait-elle ?* Non : retirer l'épinglage refait rougir l'AC.
- [x] **AC2 — rien d'autre ne bouge.** Le fichier passe trois fois de suite (11 / 49), Pint propre.
- [ ] **AC3 — suite entière verte** en CI sur la PR.

## Hors périmètre — exposition mesurée ailleurs, non corrigée ici

La même mécanique vaut pour **tout** test Meilisearch dont le dernier mot est court et qui asserte
un ensemble exact : `SearchSuggestTest` interroge `q=a`, `q=da`, `q=Thi`. Le correctif au niveau de
`PropertyFactory` (référence déterministe pour tous) couvrirait tout le dépôt, mais touche une
factory utilisée par des centaines de tests et plusieurs tests épinglent déjà leur propre
`reference_number` (`ExportScopingTest`, `TenantOnboardingChecklistTest`). À ouvrir en ticket
distinct **si** un de ces tests rougit à son tour, en commençant par mesurer s'il asserte un
ensemble exact.

## Ce que ce ticket ne dit PAS

Que `reference_number` ne devrait pas être cherchable : un agent qui tape la référence d'un bien
doit le trouver. Le défaut est dans le **corpus de test**, pas dans l'index.
