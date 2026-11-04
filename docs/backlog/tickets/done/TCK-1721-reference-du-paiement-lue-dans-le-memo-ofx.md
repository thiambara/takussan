---
id: TCK-1721
title: "La règle 95 du rapprochement lit la référence du paiement dans le MEMO OFX et le libellé CSV"
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
    - "docs/features.md"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-157--lignes-de-relevé-importées-face-au-rapprochement"
tags: [back, accounting, reconciliation, ofx, pistes]
---

## Objectif utilisateur

Un virement dont le payeur a saisi la référence de son échéance (`LP-77`) est suggéré à 95 sur
cette échéance, que la banque range ce texte dans le `MEMO` d'un relevé OFX ou dans le libellé
d'un relevé CSV. Jusqu'ici, la règle 95 ne comparait que la `reference` de la ligne, qui porte le
`FITID` en OFX : elle ne s'appliquait jamais à un relevé OFX.

## Contexte

Réf : **P157.07** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `9f180a3ae`) : deux échéances de
150 000 (`LP-77`, `LP-88`) payées le 2026-04-01 ; ligne de crédit de 150 000 au 2026-04-02,
`reference = BANK-9981`, `MEMO = LP-77` (OFX) ou libellé « Loyer avril lp-77 Diop » (CSV) → aucune
suggestion (deux candidats à 70, TCK-827).

## Décision du porteur

> validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, appliquée : chercher le `reference_number` du paiement aussi dans
`MEMO` (et dans le libellé du CSV), en gardant `FITID` en `reference` et `NAME` en `label`.

## Choix de l'implémenteur (voie la plus étroite)

- La recherche se fait **par mot entier**, casse ignorée (la référence n'est précédée ni suivie
  d'une lettre ou d'un chiffre) : une sous-chaîne nue ferait apparier `LP-77` à un `MEMO`
  `LP-770`.
- Le texte lu dépend du format du relevé : le `MEMO` (`raw_payload`) pour l'OFX, le libellé pour
  le CSV. Le libellé d'une ligne OFX (`NAME`) n'est pas lu.
- Le pilote OFX n'est pas modifié : `reference`, `label` et `counterparty` restent ce qu'ils sont.

## Delta à produire

- [x] `ReconciliationMatcher::scoreCandidate()` : règle 95 aussi quand
  `textCitesReference()` trouve le `reference_number` du candidat.
- [x] Test : `tests/Feature/Api/Accounting/ReferenceDansLeLibelleTest.php`.

## Critères d'acceptation

- [x] AC1 — OFX, `MEMO = LP-77` → suggestion à 95 sur `LP-77`.
- [x] AC2 — CSV, libellé « Loyer avril lp-77 Diop » → suggestion à 95 sur `LP-77`.
- [x] AC3 — `MEMO = LP-770`, libellé CSV `Loyer XLP-77` → aucune suggestion à 95.

## Notes d'implémentation

- Ablation : correctif retiré → 2 rouges (AC1, AC2) ; borne de mot remplacée par `stripos` → 1
  rouge (AC3) ; remis → 3 verts.
