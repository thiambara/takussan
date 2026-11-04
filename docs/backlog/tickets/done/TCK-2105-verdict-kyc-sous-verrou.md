---
id: TCK-2105
title: "Le verdict et la soumission d'un dossier KYC se jugent sur la ligne verrouillée"
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
    - "docs/models-spec.md#42-kycdossier-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-211--gestes-décriture-qui-jugent-le-statut-sur-le-modèle-lié-hors-verrou"
tags: [api, kyc, concurrence, pistes]
---

## Objectif

`KycWorkflowService::submit`, `verify` et `reject` relisent le dossier sous `lockForUpdate` dans
une transaction et y jugent leur garde : un dossier tranché entre-temps ne se tranche plus, et
l'agence n'est pas vérifiée derrière un dossier rejeté.

## Contexte

Réf : **P211.01** du fichier de pistes, `retenu · autonome` (A1).

- `verify` et `reject` jugeaient `assertTransitionable` sur le modèle lié à la route, sans
  transaction ni verrou ; `verify` écrivait ensuite l'agence par un second `update`. Un rejet sur
  une copie périmée après une vérification passait : dossier `rejected`, agence `active` et
  vérifiée, deux verdicts envoyés. `submit` jugeait de même `assertNotVerified`.

## Hypothèses (mode sans humain)

- Les avis (`notifySubmitted`, `notifyReviewed`) partent après le commit, comme
  `InventorySignatureService::sign` et TCK-1822 : un refus n'envoie rien.

## Delta à produire

- [x] `submit`, `verify`, `reject` : relecture sous verrou dans une transaction, gardes jugées sur
  la ligne relue ; l'écriture de l'agence dans la même transaction ; avis après.

## Critères d'acceptation

- [x] AC1 — Vérification puis rejet sur une copie périmée : 422 `kyc.not_transitionable`, dossier
  `verified`, agence vérifiée, un seul verdict reçu.
- [x] AC2 — Rejet puis vérification sur une copie périmée : 422 `kyc.not_transitionable`, agence non
  vérifiée, un seul verdict.
- [x] AC3 — Soumission sur une copie restée `pending` d'un dossier `verified` en base : 422
  `kyc.locked`.
- [x] AC4 — Témoin : un dossier soumis se vérifie toujours.

## Hors périmètre

- Le double `submit` (deux soumissions d'un dossier `pending`) : les deux restent acceptées, la
  garde ne refuse que `verified` ; la piste ne demande pas d'autre garde.
- `kyc:expire-dossiers` (P211.07, à valider).

## Notes d'implémentation

- Test : `takussan-api/tests/Feature/Kyc/KycVerdictSousVerrouTest.php`. Avant correctif : AC1, AC2
  et AC3 rouges (« Le geste aurait dû être refusé »).
- Ablation : `KycWorkflowService.php` remis à `HEAD` → 3 rouges ; correctif remis → 4 verts.
