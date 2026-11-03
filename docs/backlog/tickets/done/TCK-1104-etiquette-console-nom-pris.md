---
id: TCK-1104
title: "Création d'étiquette à la console : nom pris rendu en 409, slug pris suffixé"
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
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#10-tag"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, etiquettes, super-admin, pistes]
---

## Contexte

Réf : **P92.05** du fichier de pistes, `validé (délégué)` (critère accordé : V7, refuser un nom
distinct ou lui donner un slug suffixé).

`POST /api/tags` créait l'étiquette sans juger le nom ni le slug : « Piscine » sur « Piscine »
heurtait `tags_name_unique`, « piscine » et « Vue-mer » sur « Vue mer » heurtaient
`tags_slug_unique`. Trois 500. Le renommage (`TagModeration::renommer`, TCK-729) et les
propositions (`TagCatalog::slugLibre`, TCK-847) avaient déjà tranché les deux règles.

### Décision du porteur (déléguée)

> suffixer : à la création par `POST /api/tags`, un nom déjà pris à la casse près rend 409 `tags.name_taken`, jugé par `CaseInsensitive` comme dans `TagModeration::renommer` ; un nom distinct reçoit le slug de `TagCatalog::slugLibre($nom, horsCatalogue: true)`, qui suffixe un slug pris et laisse aux équipements du catalogue le leur ; aucun texte neuf ; test des trois cas mesurés (« Piscine », « piscine », « Vue-mer » sur « Vue mer »)

## Objectif utilisateur

Le super-admin qui crée une étiquette sous un nom existant reçoit le refus du renommage ; deux
noms distincts de même slug coexistent.

## Delta à produire

- [x] `TagController::store` : 409 `tags.name_taken` si un nom égal à la casse près existe
      (`CaseInsensitive`), puis slug de `TagCatalog::slugLibre($nom, horsCatalogue: true)`.
- [x] Test `tests/Feature/Tags/TagCreationNomPrisTest.php`.

## Critères d'acceptation

- [x] AC1 — « Piscine » sur « Piscine » : 409 `tags.name_taken`, une seule ligne.
- [x] AC2 — « piscine » sur « Piscine » : 409 ; idem « étage » sur « ÉTAGE » (repli hors ASCII).
- [x] AC3 — « Vue-mer » sur « Vue mer » : 201, slug `vue-mer-2`, « Vue mer » garde `vue-mer`.

## Hors périmètre

- Aucun texte neuf : `tags.name_taken` n'est pas traduit au front, qui l'affiche comme celui du
  renommage.
- La course entre deux créations simultanées (famille de P92.07).

## Notes d'implémentation

- Reproduction avant correctif : les trois tests rendent 500.
- Ablation : `TagController` rendu à `HEAD` → 3 rouges sur 3 ; correctif remis → 3/3.
