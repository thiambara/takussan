---
id: TCK-1111
title: "Garde : les bornes `max:` des requêtes de l'angle 91 confrontées à la largeur de leur colonne"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1110]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, validation, garde, pistes]
---

## Contexte

Réf : **P91.07** du fichier de pistes, `retenu · autonome` (A5 : une garde ajoutée, aucun seuil
touché).

Les corrections de l'angle 91 (TCK-1106 à TCK-1110) ajoutent des `max:` à des règles qui écrivent
dans des `varchar(N)`. Rien ne les garde : `grep character_maximum_length tests` ne trouve que deux
tests de colonnes chiffrées, et `ReglesNullableFaceAuSchemaTest` (TCK-982), son pendant pour
`nullable`, ne lit aucune règle `max:`.

## Objectif utilisateur

Une borne retirée d'une de ces règles, ou une colonne rétrécie sous la borne, rougit la suite au
lieu de rendre un 500 à l'écriture.

## Delta à produire

- [x] Test `tests/Feature/Validation/BornesMaxFaceAuSchemaTest.php`, sur le modèle de
      `ReglesNullableFaceAuSchemaTest` : la liste des couples (requête, clé, table, colonne) de
      P91.01 à P91.05.

## Critères d'acceptation

- [x] AC1 — Pour chaque couple, la colonne est un `varchar` de largeur N (`information_schema`).
- [x] AC2 — La règle de la clé porte un `max:K` avec K ≤ N.
- [x] AC3 — La règle jouée seule échoue sur la clé pour une valeur de N+1 caractères (adresse
      valide pour une clé e-mail), et passe pour une valeur de K caractères.
- [x] AC4 — Retirer le correctif de TCK-1110 rougit les couples e-mail.

## Hors périmètre

- La variante générique (toute règle `string` d'une requête qui écrit) : elle demande la table
  requête → modèle que l'angle 54 n'a pas non plus.
- Les champs de P91.08 (avis, encaissements), traités par leur propre ticket.

## Notes d'implémentation

- 44 couples : les 7 champs de chacune des trois voies d'un garant, et 23 autres.
- Ablation 1 : le correctif de TCK-1110 retiré → les 9 couples e-mail rougissent, 35 verts.
- Ablation 2 : `StoreTagRequest.color` remis à `max:20` (l'état d'avant TCK-1107) → 1 rouge,
  « borné à 20, au-delà de tags.color, varchar(7) ».
- `VisitRequestPublicPropertyRequest` résout son bien par le slug dans `rules()` : la garde lui
  donne une route liée au slug d'un bien publié, sinon `firstOrFail()` lève avant toute règle.
- La valeur à la borne K doit passer : sans ce témoin, une clé e-mail refusée pour son format
  passerait la vérification de N+1.
