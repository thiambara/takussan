---
id: TCK-1103
title: "Une recherche enregistrée sous un nom déjà pris par le compte se refuse en 422"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models:
    - "docs/models-spec.md#23-savedsearch-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, recherche, validation, pistes]
---

## Contexte

Réf : **P92.01** du fichier de pistes, `retenu · autonome` (A1 : la contrainte
`unique(user_id, name)` de `saved_searches` fixe déjà la règle).

Ni la création ni la modification ne jugeaient l'unicité du nom : deux `POST /api/saved-searches`
de même nom, ou un renommage vers un nom pris, atteignaient la contrainte, soit 500. Le dialogue du
front pré-remplit le nom depuis les filtres : enregistrer deux fois la même recherche suffit.

## Objectif utilisateur

L'utilisateur qui enregistre une recherche sous un nom qu'il a déjà employé reçoit une erreur de
validation, et non une panne serveur.

## Delta à produire

- [x] `StoreSavedSearchRequest` : `Rule::unique('saved_searches', 'name')` borné au compte appelant.
- [x] `UpdateSavedSearchRequest` : même règle, `->ignore()` de la recherche modifiée.
- [x] Test `tests/Feature/Api/SavedSearchDuplicateNameTest.php`.

## Critères d'acceptation

- [x] AC1 — deux `POST` de même nom pour un compte : 201 puis 422 sur `name`, une seule ligne.
- [x] AC2 — le même nom reste libre pour un autre compte (201).
- [x] AC3 — `PATCH` vers le nom d'une autre recherche du compte : 422 sur `name` ; renvoyer son
      propre nom : 200.

## Hors périmètre

- Hypothèse (mode sans humain) : la réponse est le message `validation.unique` existant, sans code
  `saved_search.name_taken` ni texte neuf, comme le dit le correctif attendu de la mesure.
- Le dialogue du front (`SaveSearchDialog`) affiche toujours son erreur générique sur tout échec :
  lui faire afficher l'erreur de nom pris est laissé en reste.
- Le nom de repli `"X #id"` du rattachement des alertes (P92.09).

## Notes d'implémentation

- Reproduction avant correctif : le second `POST` et le `PATCH` rendent 500
  (`saved_searches_user_id_name_unique`).
- Ablation : les deux FormRequest rendues à `HEAD` → 2 rouges sur 3 (le témoin « autre compte »
  reste vert, comme attendu) ; correctif remis → 3/3.
