---
id: TCK-2107
title: "La décision d'une demande de passage en agence juge `pending` sur la ligne verrouillée"
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
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [api, agency-upgrade, concurrence, pistes]
---

## Objectif

`AgencyUpgradeReviewService::approve` et `reject` relisent la demande sous `lockForUpdate` dans
leur transaction et y jugent `pending` : une demande tranchée entre-temps ne se tranche plus.

## Contexte

Réf : **P211.02** du fichier de pistes, `retenu · autonome` (A1).

- `approve` et `reject` jugeaient `assertPending` sur le modèle lié, avant la transaction. Un rejet
  sur une copie périmée après une approbation passait : demande `rejected`, agence déjà passée en
  `standard`, et le demandeur recevait les deux avis.

## Hypothèses (mode sans humain)

- Le contrôle `assertPending` d'avant la transaction reste : il garde l'ordre actuel des refus
  (`not_pending` avant le KYC et la suspension). Le contrôle neuf le répète sur la ligne verrouillée.

## Delta à produire

- [x] `approve`, `reject` : relecture sous verrou dans la transaction, `pending` jugé sur la ligne
  relue, écriture et bascule faites sur elle.

## Critères d'acceptation

- [x] AC1 — Approbation puis rejet sur une copie périmée : 422 `not_pending`, demande `approved`,
  agence `standard`, aucun avis de rejet.
- [x] AC2 — Rejet puis approbation sur une copie périmée : 422 `not_pending`, demande `rejected`,
  agence `individual`, aucun avis d'approbation.
- [x] AC3 — Témoin : une demande en attente s'approuve toujours.

## Hors périmètre

- Les autres gestes de l'angle 211 (tickets à part).

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Admin/AgencyUpgradeReviewSousVerrouTest.php`. Avant correctif :
  AC1 et AC2 rouges (« La seconde décision aurait dû être refusée »).
- Ablation : `AgencyUpgradeReviewService.php` remis à `HEAD` → 2 rouges ; correctif remis → 3 verts.
