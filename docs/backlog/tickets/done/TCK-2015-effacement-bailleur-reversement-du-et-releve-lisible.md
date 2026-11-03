---
id: TCK-2015
title: "Un reversement dû retient l'effacement du bailleur, et son relevé reste lisible une fois effacé"
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
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#56-accountdeletionrequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-175--relations-vers-un-compte-supprimé-en-douceur-par-la-suppression-de-compte"
tags: [api, web, reversements, compte, effacement, pistes]
---

## Objectif utilisateur

Un bailleur ne peut pas effacer son compte tant que l'agence lui doit encore un reversement ; une
fois effacé, l'agence relit toujours son relevé de gérance.

## Contexte

Réf : **P175.03** du fichier de pistes, `validé`.

Mesuré avant correctif sur `e261b5ef2` : bailleur à bail `terminated`, loyers de septembre
encaissés et non reversés → `collectOpenObligations()` rend `[]` ; même chose avec un
reversement `pending`. Après `executeDeletion()`, un agent de l'agence qui tient
`payouts.create` → `GET /api/owner-statements?period=2026-09&landlord_id=…` **403**.

## Décision du porteur

> validé — validation du porteur (2026-10-23) : une obligation bloquante tant qu'une pièce est reversable ou qu'un reversement est en cours, et le relevé lisible pour un compte effacé (`withTrashed()` sur la seule lecture) ; la préparation reste fermée

## Hypothèses (mode sans humain)

- « Pièce reversable » : ce que `PayoutCalculator::leasePayments()` et `bookingPayments()`
  rendraient sans période, dans toute agence où le compte a un bail ou un bien réservé. Les
  factures d'intervention refacturables sont une retenue, pas une somme due : elles ne retiennent
  pas l'effacement.
- « Reversement en cours » : un `Payout` du compte (`landlord_id`) dans `PayoutStatus::upcoming()`
  (`awaiting_approval`, `pending`, `scheduled`, `processing`), quel que soit son `payee_role`.
- Deux obligations : `payout` (une par reversement, sa référence) et `payout_due` (une par agence,
  `id` = l'agence). Libellés neufs, sur le modèle des quatre existants : « Reversement en cours
  :reference. », « Reversement dû par :agency. » ; en `wo`, le français tel quel (wolof en pause).
- La lecture ouverte est le relevé (`OwnerStatementRequest::landlord()`, JSON, PDF et CSV) : la
  policy y reconnaît le bailleur effacé par son profil de bailleur de l'agence, même supprimé par
  `endProfiles()`. Hors de l'agence ou sans `payouts.create`, toujours 403.

## Hors périmètre

- La préparation et la création d'un reversement pour un compte effacé (décision du porteur).
- La ligne de `models-spec.md` sur les obligations, à aligner en session.

## Delta à produire

- [x] `AccountDeletionService::collectOpenObligations()` : obligations `payout` et `payout_due`.
- [x] `lang/{fr,en,wo}/account.php` : `payout_upcoming`, `payout_due`.
- [x] `OwnerStatementRequest::landlord()` en `withTrashed()` ; `OwnerStatementPolicy` reconnaît
  le profil supprimé d'un compte effacé.
- [x] Type du front `AccountDeletionObligation.type` : `payout`, `payout_due`.
- [x] Garde : `tests/Feature/Account/EffacementBailleurReversementTest.php`.

## Critères d'acceptation

- [x] AC1 — Une pièce encaissée et non reversée → obligation `payout_due`.
- [x] AC2 — Un reversement `pending` → obligation `payout`, plus de `payout_due`.
- [x] AC3 — Le reversement versé → aucune obligation ; annulé → `payout_due` de nouveau.
- [x] AC4 — Bailleur effacé : le relevé rend 200 et les mêmes totaux au personnel de l'agence ;
  403 hors de l'agence ; la préparation rend toujours 404.

## Notes d'implémentation

- Ablation : sans les deux obligations, AC1, AC2 et AC3 (annulé) rouges ; sans le
  `withTrashed()` de la requête, AC4 rouge (403) ; sans la branche du compte effacé dans la
  policy, AC4 rouge (403) ; rétablis → 5 verts.
- Piège : un statut forcé à `cancelled` ne détache pas les pièces du reversement ; le test passe
  par `POST /api/payouts/{id}/cancel`.
