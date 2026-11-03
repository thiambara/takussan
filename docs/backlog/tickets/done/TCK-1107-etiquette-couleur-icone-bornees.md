---
id: TCK-1107
title: "Couleur et icône d'étiquette bornées à leur colonne : 422 et non 500"
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
  models:
    - "docs/models-spec.md#10-tag"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-91--bornes-max-des-formrequests-face-aux-varcharn"
tags: [back, etiquettes, validation, pistes]
---

## Contexte

Réf : **P91.02** du fichier de pistes, `retenu · autonome` (A1 : la colonne fixe la borne, seul le
500 devient 422).

`tags.color` est un `varchar(7)`, `tags.icon` un `varchar(255)`. `StoreTagRequest` et
`UpdateTagRequest` acceptaient une couleur de 20 caractères et une icône sans borne : PostgreSQL
refusait l'écriture (22001), soit 500.

## Objectif utilisateur

Le super-admin, ou un client direct de l'API, qui envoie une couleur ou une icône trop longue
reçoit une erreur de validation sur le champ, et non une panne serveur.

## Delta à produire

- [x] `StoreTagRequest` et `UpdateTagRequest` : `color` en `max:7`, `icon` en `max:255`.
- [x] Test `tests/Feature/Tags/TagFieldLengthTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/tags` avec `color: '#ff0000ff00'` ou une `icon` de 256 caractères : 422 sur la
      clé, aucune étiquette créée ; `#ff0000` et une icône de 255 : 201.
- [x] AC2 — `PATCH /api/tags/{id}` avec `color: 'turquoise'` ou une `icon` de 256 : 422, étiquette
      inchangée ; à la borne : 200.

## Hors périmètre

- Le format `#rrggbb` (`regex` ou `hex_color`) : il refuserait des valeurs courtes qui s'écrivent
  aujourd'hui.

## Notes d'implémentation

- Ablation : les deux FormRequest rendues à `HEAD` → 2 rouges sur 2 ; correctif remis → 2/2.
