---
id: TCK-2056
title: "L'annulation d'un reversement plateforme juge sa transition sur la ligne verrouillée"
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
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#lannulation-dun-reversement-plateforme-juge-le-statut-hors-verrou--une-annulation-concurrente-dun-paiement-peut-écraser-paid-et-rendre-les-lignes-éligibles-à-une-nouvelle-clôture"
tags: [api, platform-payouts, concurrence, pistes]
---

## Objectif

`PlatformPayoutService::cancel` verrouille la ligne du reversement dans sa transaction et juge la
transition sur la ligne verrouillée : un reversement payé entre-temps n'est plus écrasé en
`cancelled`, et ses lignes ne sont pas détachées.

## Contexte

Réf : **P182.05** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-23) : la piste telle qu'écrite (verrou et transaction, patron d'`approve` et `markPaid`)

- `cancel` appelait `assertTransition` sur le modèle lié à la route, hors transaction, puis
  détachait les paiements et écrivait `cancelled` sans relire la ligne. `approve` et `markPaid`
  verrouillent et jugent sur la ligne verrouillée.

## Hypothèses (mode sans humain)

- Aucune.

## Delta à produire

- [x] `cancel` : `lockForUpdate` dans la transaction, transition jugée et écriture faite sur la ligne
  verrouillée.

## Critères d'acceptation

- [x] AC1 — Un reversement `paid` en base derrière un modèle resté `approved` en mémoire : `cancel`
  rend 422 `platform_payout.status_transition_invalid`, le statut reste `paid`, les lignes restent
  attachées.
- [x] AC2 — Témoin : un reversement `approved` s'annule et détache ses lignes.

## Hors périmètre

- Le second `cancel` après une réponse perdue (422 sur `cancelled`), relevé dans le constat :
  la piste ne le demande pas.

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Api/Admin/PlatformPayoutCancelLockTest.php`. Avant
  correctif : AC1 rouge (« Un reversement payé a été annulé »).
- Ablation : `PlatformPayoutService.php` remis à `HEAD` → 1 rouge ; correctif remis → 2 verts.
