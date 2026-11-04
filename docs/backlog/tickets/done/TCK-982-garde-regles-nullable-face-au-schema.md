---
id: TCK-982
title: "Une garde confronte les règles nullable connues aux colonnes NOT NULL"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models:
    - "docs/models-spec.md#3-property"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-54--règles-nullable-face-aux-colonnes-not-null"
tags: [api, validation, tests, garde, pistes]
---

## Contexte

Réf : **P54.07** du fichier de pistes, `retenu · autonome` (A5). Le défaut de P17.01 (TCK-703) —
une règle `nullable` sur une clé qui vise une colonne `NOT NULL`, un `null` explicite qui rend 500 —
avait sept autres formes, corrigées par TCK-976 à TCK-981. Re-mesuré le 2026-10-19 sur `pre-dev`
70d05c24b : aucun test ne lit un FormRequest face à `information_schema`
(`grep -rln information_schema tests scripts` → 6 tests, chacun sur une colonne ou un jeton).

## Objectif

Une garde qui rougit si l'un des couples (requête, clé) connus pour viser une colonne `NOT NULL`
reprend `nullable`, ou laisse passer un `null`.

## Delta à produire

- [x] `tests/Feature/Validation/ReglesNullableFaceAuSchemaTest.php` : 15 couples (adresse ville et
      pays, `furnished`, forfait, note client, relevé bancaire, état des lieux), et pour chacun :
      colonne toujours `NOT NULL` dans `information_schema`, règle sans `nullable`, règle jouée seule
      sur `null` → erreur sur la clé.

## Critères d'acceptation

- [x] AC1 — Les 15 couples sont verts sur l'arbre corrigé.
- [x] AC2 — Une règle remise à `nullable` rougit son couple.
- [x] AC3 — Un couple qui vise une colonne nullable rougit, avec un message qui dit de le retirer.

## Hypothèses (mode sans humain)

- La forme simple de la `Piste` : une liste écrite à la main. La variante générique (rejouer un
  `null` sur toute clé `nullable` de tout FormRequest qui écrit `validated()` dans un modèle)
  demande la table requête → modèle ; laissée en reste.
- `InventoryStoreRequest` (`required`) et les règles de `UpdatePropertyRequest` (`sometimes`) déjà
  justes entrent dans la liste : elles visent les mêmes colonnes, et la garde les tient aussi.

## Hors périmètre

- Le rendu d'une `QueryException` en 422 dans `bootstrap/app.php` (déclencheur dur de la suite).
- Les couples non relevés par l'angle 54 : la garde ne voit que ce qu'elle liste.

## Notes d'implémentation

- Ablation : `InventoryUpdateRequest` et `StorePropertyRequest` remises à leur version de `pre-dev`
  → 3 rouges sur 15 ; remises → 15 verts. Témoin `properties.description` (nullable) ajouté puis
  retiré → rouge sur l'assertion de schéma.
- Les assertions 2 et 3 se recouvrent : la 3 tient une règle qui refuserait le `null` autrement
  qu'en omettant `nullable` ; la 2 donne le message lisible.
