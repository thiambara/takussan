---
id: TCK-933
title: "Le rapprochement d'un relevé bancaire est découpé en lots, chacun son job, et ne relit plus le relevé à chaque ligne"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#matchbankstatementjob-na-ni-timeout-ni-failed-et-fait-plusieurs-requêtes-par-ligne--un-gros-relevé-nest-rapproché-quen-partie-sans-trace-pour-lagence"
tags: [back, accounting, reconciliation, queue, pistes]
---

## Contexte

Réf : **P43.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`MatchBankStatementJob` parcourt toutes les lignes `unmatched` d'un relevé dans un seul job, sans
délai propre (60 s du worker) et avec `$tries = 1`. `suggestFor()` relit le relevé à chaque ligne.
Au délai, le processus est tué et les lignes suivantes restent `unmatched`, sans reprise.

## Décision du porteur

précharger `statement` (ou passer l'agence une fois), et découper le rapprochement en lots, chacun son job, comme `RegenerateAgencyWatermarksJob`

## Objectif utilisateur

L'agence voit toutes les lignes d'un gros relevé passer au rapprochement, même quand il dépasse
ce qu'un job fait dans le délai du worker.

## Hypothèses (mode sans humain)

- Lots de 200 lignes : environ 15 ms par ligne mesurés sur base vide (P43.02), soit quelques
  secondes par lot, loin du délai.
- Les deux jobs prennent le patron de `RegenerateAgencyWatermarksJob` : `$timeout = 75` sous le
  `retry_after` de 90 s, `$tries = 3`, `$backoff = [30, 120]`. Un lot est idempotent : il ne
  traite que les lignes encore `unmatched`.
- Aucun signal neuf à l'agence (comportement visible, non accordé).

## Delta à produire

- [x] `MatchBankStatementJob` devient un répartiteur : un `MatchBankStatementLinesJob` par lot
  de 200 identifiants de lignes `unmatched` (`chunkById`), file `reconciliation`.
- [x] `MatchBankStatementLinesJob` (neuf) : lit le relevé une fois, le pose sur chaque ligne
  (`setRelation`), puis appelle `suggestFor()` comme avant.
- [x] Tests : `MatchBankStatementBatchesTest` (4 cas).

## Critères d'acceptation

- [x] AC1 — 450 lignes `unmatched` → 3 lots d'au plus 200, qui portent exactement ces lignes ;
  ni une ligne déjà suggérée ni une ligne d'un autre relevé.
- [x] AC2 — 100 lignes rapprochées : le relevé est lu au plus 3 fois (102 avant), et la ligne à
  référence exacte reçoit sa suggestion à 95.
- [x] AC3 — Un lot rejoué ne retouche pas une ligne déjà traitée.
- [x] AC4 — Les deux jobs ont un `$timeout` strictement inférieur au `retry_after` de chaque
  connexion.

## Hors périmètre

- Signaler à l'agence un rapprochement abandonné (V7, non accordé).
- `BankStatementLine::auditAgencyId()` relit le relevé à chaque ligne suggérée, pour l'audit :
  une requête par suggestion, non par ligne parcourue.
- Le `--timeout` du worker (`compose.api.yml`), chemin fermé aux agents.

## Notes d'implémentation

- Avant correctif : AC2 rouge (relevé relu 102 fois pour 100 lignes), AC1, AC3 et AC4 rouges
  faute de job de lot.
- Ablations : `setRelation` retiré → AC2 rouge (103 lectures) ; `LOT = 100000` → AC1 rouge (un
  seul lot) ; `$timeout` retiré → AC4 rouge. Tout remis → 4 verts.
- Le répartiteur garde son nom et son constructeur : `ParseBankStatementJob` l'enchaîne
  toujours, et `BankStatementPipelineTest` appelle encore `handle()` en direct — la file
  synchrone des tests exécute les lots en ligne.
