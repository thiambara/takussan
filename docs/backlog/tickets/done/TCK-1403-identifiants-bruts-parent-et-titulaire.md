---
id: TCK-1403
title: "`filter[parent_id]` des biens et `filter[user_id]` des moyens de reversement jugent l'identifiant"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#24-recherche--filtres"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-151--valeurs-de-filter-passées-brutes-à-une-colonne-typée"
tags: [back, filtres, pistes]
---

## Objectif utilisateur

Un identifiant illisible dans ces deux filtres rend une réponse du client (400, 403), plus une
erreur du serveur.

## Contexte

Réf : **P151.05** du fichier de pistes, `retenu · autonome` (A1).

Mesuré avant correctif (gardes ci-dessous, rouges sur `e72d2ad69`) :
`/api/properties?filter[parent_id]=abc` → 500 (`22P02 bigint`), `-1` → 200 ;
`/api/payout-methods?filter[user_id]=abc` → 500, `authorize()` faisant le `find()` avant la
règle `integer`.

## Hypothèses (mode sans humain)

- `parent_id` : la branche non nulle passe par `ExactIdentifierFilter::exiger()` (400
  `filter.identifier_invalid`, le refus des autres filtres d'identifiant, liste comprise).
- `ListPayoutMethodsRequest` : le `find()` n'a lieu que sur un entier ou une chaîne de chiffres
  (18 au plus, la borne d'`ExactIdentifierFilter`) ; sinon le titulaire est nul et `authorize()`
  rend 403, comme pour un titulaire introuvable. La politique `viewHolder` n'est pas touchée.

## Delta à produire

- [x] `Property::getAllowedQueryFilters()` : `parent_id` non nul jugé par `ExactIdentifierFilter`.
- [x] `ListPayoutMethodsRequest::authorize()` : `find()` sur un identifiant lisible seulement.
- [x] Tests : deux méthodes neuves de `FiltreIdentifiantTest`.

## Critères d'acceptation

- [x] AC1 — `filter[parent_id]` = `abc`, `-1`, `1.5`, `1,abc`, ou un nombre hors `bigint` → 400
  `filter.identifier_invalid` ; `null` → 200.
- [x] AC2 — `/api/payout-methods?filter[user_id]=abc` → 403.

## Notes d'implémentation

- Ablation : les deux fichiers de `app/` rendus à leur état antérieur → 6 rouges ; remis → verts.
