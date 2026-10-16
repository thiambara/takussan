---
id: TCK-714
title: "Sous impersonation, l'identifiant de versement sort masqué (4 derniers caractères)"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#76-payoutmethod-
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation
tags: [api, impersonation, payout, privacy, pistes]
---

## Contexte

Réf : **P03.04** du fichier de pistes, `validé` par le porteur (critères accordés : V2 et V3).

`PayoutMethodResource` rend `account_identifier` et `account_holder_name` en clair au
« titulaire », c'est-à-dire à l'utilisateur de la requête. Sous impersonation, c'est la cible :
l'opérateur lit donc en clair, par `GET /api/me/payout-methods`, les comptes de reversement de
l'utilisateur qu'il incarne. La route n'est ni dans `REFUSED_READS` ni sous step-up.

## Décision du porteur

account_identifier masqué (4 derniers caractères) sous impersonation

## Objectif

Sous une session d'impersonation, `account_identifier` sort sous sa forme masquée
(`PayoutMethod::mask()`, quatre derniers caractères), et jamais en clair.

## Delta à produire

- [ ] `PayoutMethodResource` : quand `ImpersonationContext` est actif, `account_identifier` vaut
      `PayoutMethod::mask(account_identifier)`.
- [ ] Test `tests/Feature/Admin/Platform/ImpersonationPayoutMethodsTest.php`.

## Critères d'acceptation

- [ ] AC1 — Sous le jeton d'impersonation, `GET /api/me/payout-methods` rend
      `account_identifier` = `•••• 4567` pour le numéro `+221 77 123 45 67`, et la réponse ne
      contient le numéro sous aucune forme claire.
- [ ] AC2 — La cible, sous son propre jeton, lit toujours la forme claire.

## Hypothèses (mode sans humain)

- La clé `account_identifier` reste présente, avec la forme masquée pour valeur : la décision dit
  « masqué », pas « retiré ». Le front ne l'affiche pas (il affiche `masked_identifier`).
- `account_holder_name` n'est pas visé par la décision et reste tel quel.
- Les écritures (`store`, `update`) sont déjà refusées sous impersonation par
  `EnforceImpersonationReadOnly` ; le masquage de la ressource les couvre de toute façon.

## Hors périmètre

- Ajouter `api/me/payout-methods*` à `REFUSED_READS` (l'autre option de la piste, non retenue).
- `account_holder_name` sous impersonation.

## Notes d'implémentation
