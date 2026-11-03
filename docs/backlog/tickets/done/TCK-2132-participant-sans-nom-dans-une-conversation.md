---
id: TCK-2132
title: "Un participant de conversation sans nom est nommé « — » par l'API, et le front retombe sur #id et « ? »"
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
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-220--noms-de-comptes-rendus-par-le-front-sans-repli-face-aux-comptes-créés-par-téléphone"
tags: [api, front, messagerie, pistes]
---

## Contexte

Réf : **P220.01** du fichier de pistes, `retenu · autonome` (A1 : la règle est écrite par le
docblock de `User::nameWithoutContact()`, TCK-815, qui vise `ConversationResource`).
`ConversationResource` rendait `participants[].user.full_name` par `$user->full_name`, soit `''`
pour un compte créé par téléphone ; `ParticipantRow` retombait par `??`, que `''` ne déclenche pas :
la ligne ne portait que le rôle.

## Objectif utilisateur

Un membre d'une conversation reste identifiable dans la feuille d'infos, même sans nom saisi.

## Contrat de données

`GET /api/conversations/{id}` : `participants[].user.full_name` vaut prénom et nom, puis
`username`, puis `—` ; jamais `''`, jamais une coordonnée.

## Delta à produire

- [x] `ConversationResource` : `full_name` des participants par `nameWithoutContact()`.
- [x] `ParticipantRow` : replis `#<user_id>` et `?` par `||` au lieu de `??`.
- [x] Tests : `SenderNameWithoutContactTest` (participant sans nom → `—`), `ParticipantRow.test.tsx`
  (`full_name: ''` → `#42` et `?`).

## Critères d'acceptation

- [x] AC1 — un participant à noms vides et sans `username` est rendu `full_name = "—"`, sans son e-mail.
- [x] AC2 — `ParticipantRow` avec `full_name: ''` affiche `#<user_id>` et les initiales `?`.

## Hors périmètre

- Les autres écrans qui composent un nom sans repli (P220.04, P220.05, à valider).

## Notes d'implémentation

- Ablation API : `full_name` remis à `$user->full_name` → le test rougit (`''` au lieu de `—`).
- Ablation front : le `||` du nom remis à `??` → le cas `full_name: ''` rougit (`#42` absent).
- Avec l'API corrigée, le front reçoit `—`, et l'initiale affichée est `—` ; le repli `||` couvre
  une réponse plus ancienne ou un autre chemin qui rendrait `''`.
