---
id: TCK-1885
title: "Le sujet d'une conversation directe est borné à 255 caractères : 422 au lieu de 500"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [back, messagerie, validation, pistes]
---

## Objectif utilisateur

Un sujet trop long à la création d'une conversation directe est refusé par un message de
validation sur `subject`, au lieu d'une erreur serveur.

## Contexte

Réf : **P195.01** du fichier de pistes, `retenu · autonome` (A1 : la borne est écrite par la
colonne `varchar(255)`, par le renommage `UpdateConversationRequest` et par la création de groupe).

`StoreConversationRequest` n'a que `['nullable', 'string']` sur `subject` : 300 caractères partent
vers `varchar(255)` et rendent 500 (`SQLSTATE[22001]`).

## Hypothèses (mode sans humain)

- Le message de validation est celui de Laravel pour `max`, comme au renommage : aucun texte neuf.

## Delta à produire

- [x] `max:255` sur `subject` de `StoreConversationRequest`.
- [x] Test dans `tests/Feature/Api/ConversationTest.php`.

## Critères d'acceptation

- [x] AC1 — `POST /api/conversations` avec un `subject` de 256 caractères → 422 sur `subject`, aucune conversation créée.
- [x] AC2 — Un `subject` de 255 caractères est accepté.

## Hors périmètre

- La borne de `initial_message` et des messages (P195.04, à valider).

## Notes d'implémentation

- Ablation : `max:255` retiré → le test rougit sur `QueryException` (`varchar(255)`) ; remis → vert.
