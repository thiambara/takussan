---
id: TCK-827
title: "Rapprochement : deux encaissements à égalité au meilleur score, aucune suggestion"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-25--rapprochement-bancaire-quand-une-pénalité-est-incluse-dans-lencaissement"
tags: [back, accounting, reconciliation, pistes]
---

## Contexte

Réf : **P25.05** du fichier de pistes, `validé` (V7 accordé).

`ReconciliationMatcher::scoreCandidates()` ne jugeait l'ambiguïté qu'au palier 60. Aux paliers
70, 80 et 95, le premier candidat rencontré l'emportait (`>` strict), dans l'ordre de la requête :
deux loyers identiques payés le même jour donnaient une suggestion à 70 de confiance sur l'un des
deux, au hasard.

## Décision du porteur

validé — à égalité entre deux encaissements, aucune suggestion

## Objectif utilisateur

L'agence ne se voit pas suggérer, avec confiance, un encaissement choisi au hasard entre deux qui
correspondent également à la ligne du relevé : elle apparie elle-même.

## Delta à produire

- [x] `ReconciliationMatcher::scoreCandidates()` : deux candidats ou plus au meilleur score, quel
      que soit le palier, et la ligne reste sans suggestion.
- [x] `tests/Feature/Api/Accounting/ReconciliationAmbiguityTest.php`.

## Critères d'acceptation

- [x] AC1 — Deux loyers de 150 000 payés le même jour, crédit à J+1 (palier 70) : aucune suggestion.
- [x] AC2 — Deux loyers du même payeur, crédit à J+5 avec sa contrepartie (palier 80) : aucune
      suggestion.
- [x] AC3 — Deux loyers portant la référence de la ligne (palier 95) : aucune suggestion.
- [x] AC4 — Témoin : un loyer à 70 et un autre à 60, le premier reste suggéré à 70.

## Hypothèses

- « À égalité » s'entend au meilleur score : un candidat moins bien classé ne rend pas la ligne
  ambiguë (AC4). La règle vaut aussi pour les débits (reversements), qui passent par la même
  fonction.
- Le palier 95 est compris : deux encaissements de même référence sont aussi indiscernables.

## Notes d'implémentation

- **Ablation** : `scoreCandidates()` d'origine remis, AC1, AC2 et AC3 rougissent (une suggestion
  au premier candidat), AC4 reste vert ; correctif remis, 4 verts.
