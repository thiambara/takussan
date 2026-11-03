---
id: TCK-1407
title: "Une valeur en liste là où un filtre attend une chaîne ne rend plus 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1405]
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, filtres, pistes]
---

## Objectif utilisateur

Une URL forgée avec `filter[x][]=` rend la réponse que le filtre donne déjà à une valeur
inconnue, plus une erreur du serveur.

## Contexte

Réf : **P151.06** du fichier de pistes, `retenu · autonome` (A1 : chaque lecture a déjà sa
réponse à une valeur inconnue).

Mesuré avant correctif (gardes ci-dessous, rouges sur `e72d2ad69`) :
`/api/tasks?filter[due][]=today` → 500 ; `/api/reviews?filter[moderation_status][]=pending` → 500.
`/api/properties?filter[created_to][]=2026-10-22` → 500 avant TCK-1405, 422 après (règle `string`
de `DateBoundaryFilter::exiger()`).

## Hypothèses (mode sans humain)

- `due` : une liste est une valeur inconnue → aucune tâche (`whereRaw('1 = 0')`, le `default`).
- `moderation_status` : une liste est ignorée, comme un statut inconnu.
- `created_to` : la règle `date` (422) de TCK-1405 ; seule la garde est ajoutée ici.

## Delta à produire

- [x] `Task` : `due` lu par `is_string()`.
- [x] `ReviewController::index` : `moderation_status` lu par `is_string()`.
- [x] Tests : `TaskDueFilterTest::test_a_list_value_returns_nothing`,
  `ReviewModerationQueueTest::test_a_list_moderation_status_is_ignored`,
  `DateIllisibleDansUnFiltreTest::test_une_liste_de_dates_est_refusee_en_422`.

## Critères d'acceptation

- [x] AC1 — `filter[due][]=today` → 200, aucune ligne.
- [x] AC2 — `filter[moderation_status][]=pending` → 200, filtre ignoré.
- [x] AC3 — `filter[created_to][]=2026-10-22` → 422.

## Notes d'implémentation

- Ablation : `Task.php` et `ReviewController.php` rendus à leur état antérieur → 2 rouges (500) ;
  la ligne `DateBoundaryFilter::exiger(…, 'created_to')` de `Property` retirée → rouge (500) ;
  remis → verts.
