---
id: TCK-1295
title: "Un appel abandonné par sa borne s'affiche comme une panne réseau"
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
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-113--appels-du-navigateur-vers-lapi-sans-délai"
tags: [front, i18n, network, pistes]
---

## Contexte

Réf : **P113.04** du fichier de pistes, `retenu · autonome` (A1). Livrée avant P113.01 (TCK-1297),
qui pose une borne aux lectures du navigateur : la décision du porteur sur P113.01 demande que le
délai s'affiche comme une panne réseau.

`messageErreurApi` ne reconnaît que le `TypeError` comme panne réseau. La raison d'un
`AbortSignal.timeout` est une `DOMException` `TimeoutError` : sous Node, un `Error` dont le message
anglais (« The operation was aborted due to timeout ») passait tel quel à l'écran ; sous jsdom, pas
un `Error`, donc le repli de l'appelant.

## Objectif utilisateur

Un appel resté sans réponse jusqu'à sa borne affiche le libellé de panne réseau, dans la langue de
l'utilisateur.

## Contrat de données

Aucun changement d'API. Libellé existant `errors.api.network` : aucun texte neuf.

## Delta à produire

- [x] `messageErreurApi` rend `errors.api.network` pour toute erreur nommée `TimeoutError`.
- [x] Test avec la raison réelle d'`AbortSignal.timeout`, et une `DOMException` au message de Chrome.

## Critères d'acceptation

- [x] AC1 — La raison d'`AbortSignal.timeout(1)` rend `errors.api.network`.
- [x] AC2 — `new DOMException('signal timed out', 'TimeoutError')` rend `errors.api.network`.
- [x] AC3 — Un `Error` ordinaire garde son message déjà traduit.

## Hors périmètre

- Un libellé « délai dépassé » distinct (texte neuf).
- `messageCorpsErreurBff` (corps de réponse, sans exception).

## Notes d'implémentation

- Lu par le nom seul, et non par `instanceof Error` : sous jsdom, `new DOMException(…)` n'est pas
  un `Error`, alors que la raison d'`AbortSignal.timeout` l'est (deux classes `DOMException`).
- Ablation : `api.ts` rendu à `HEAD` → 2 rouges sur 3 ; correctif remis → 3/3 verts, et
  `api-erreurs-bff.test.tsx` reste vert (53 tests à deux fichiers).
