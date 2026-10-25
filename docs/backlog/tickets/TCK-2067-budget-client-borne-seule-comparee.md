---
id: TCK-2067
title: "Une borne de budget du client modifiée seule se compare à l'autre borne enregistrée"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-209--requêtes-de-modification-qui-ne-rejouent-pas-les-règles-de-la-création"
tags: [api, crm, validation, pistes]
---

## Objectif

`PATCH /api/customers/{id}` refuse en 422 un `budget_max` envoyé seul sous le `budget_min`
enregistré, et un `budget_min` envoyé seul au-dessus du `budget_max` enregistré.

## Contexte

Réf : **P209.03** du fichier de pistes, `retenu · autonome` (A1).

- La règle `gte:budget_min` de `ValidatesCustomerContactAndCriteria` ne s'applique que si
  `budget_min` est dans la requête ; à la modification, la borne enregistrée n'était jamais lue.
  Un client à 500 000 / 100 ne reçoit plus aucun bien de `ProspectMatcher`.

## Hypothèses (mode sans humain)

- Les deux bornes envoyées ensemble restent jugées par la règle partagée avec la création.
- Une borne envoyée à `null` efface la contrainte : l'autre borne passe alors librement
  (comportement de TCK-591, « un critère s'efface en envoyant `null` »).
- Le message est celui de Laravel (`validation.gte.numeric`, `validation.lte.numeric`), comme
  la règle `gte:` qu'il prolonge.

## Delta à produire

- [x] `UpdateCustomerRequest::after()` : la borne envoyée seule comparée à l'autre borne de la
  fiche.
- [x] `CustomerCriteriaValidationTest` : chaque borne seule de part et d'autre de la valeur
  enregistrée.

## Critères d'acceptation

- [x] AC1 — Fiche à 500 000 / 800 000 : `PATCH {budget_max: 100}` → 422 sur `budget_max`,
  `PATCH {budget_min: 900000}` → 422 sur `budget_min`, ligne inchangée.
- [x] AC2 — Une borne seule du bon côté passe (200), et le plancher effacé libère le plafond.

## Hors périmètre

- Le formulaire du front, qui envoie déjà les deux bornes ensemble et les compare.

## Notes d'implémentation

- Avant correctif : les deux cas rendent 200.
- Ablation : `after()` rendu vide → 2 rouges ; remis → 6 verts.
- Le crochet ne juge pas quand une erreur porte déjà sur l'une des bornes (pas de double message).
