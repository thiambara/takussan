---
id: TCK-1995
title: "La réinitialisation forcée du mot de passe d'un compte sans e-mail est refusée par un code"
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
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#1-user"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-réinitialisation-forcée-du-mot-de-passe-dun-compte-sans-e-mail-rend-500"
tags: [api, admin, support, auth, pistes]
---

## Contexte

Réf : **P193.02** du fichier de pistes, `validé` (V2 accordé).

`UserSupportService::forcePasswordReset` appelait `Password::broker()->sendResetLink(['email' =>
$target->email])` sans regarder l'adresse : pour un compte sans e-mail (créé par téléphone),
l'insertion dans `password_reset_tokens` (e-mail clé primaire, non nulle) rendait 500.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : refus par un code (`409 support.no_email`) avant tout appel au broker

## Objectif utilisateur

Le super-admin qui force la réinitialisation d'un compte sans e-mail reçoit un refus lisible, et
rien n'est écrit ni révoqué.

## Delta à produire

- [x] `UserSupportService::forcePasswordReset` : `abort_code_if(blank($target->email), 409,
  'support.no_email')` après `guardTarget`, avant le broker.
- [x] `errors.support.no_email` en `fr`, `en`, `wo` (= le français).
- [x] `UserSupportTest::test_force_password_reset_refuses_an_account_without_email`.

## Critères d'acceptation

- [x] AC1 — cible sans e-mail → 409 `support.no_email`.
- [x] AC2 — aucune ligne `password_reset_tokens`, jetons de la cible gardés, journal non écrit,
  aucune notification.
- [x] AC3 — le cas nominal (cible à e-mail) est inchangé.

## Hors périmètre

- La `Piste` parlait d'« e-mail vérifié » ; la décision nomme le code `no_email`. Hypothèse : seul
  un e-mail absent est refusé, un e-mail non vérifié reçoit toujours le lien, comme avant.

## Notes d'implémentation

- Avant correctif : 500 (`SQLSTATE[23502]`). Ablation (garde retirée) : le même 500 ; remise → 11/11.
