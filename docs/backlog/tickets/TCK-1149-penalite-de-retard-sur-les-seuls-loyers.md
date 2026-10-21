---
id: TCK-1149
title: "La pénalité de retard ne tombe que sur les échéances de loyer"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#15-leasepayment-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#la-pénalité-de-retard-tombe-aussi-sur-lindemnité-de-résiliation-et-sur-les-lignes-qui-ne-sont-pas-des-loyers"
tags: [back, lease, late-fees, pistes]
---

## Objectif utilisateur

Un locataire ne paie pas de pénalité de retard sur son indemnité de résiliation, sa caution, ses
charges ou une régularisation : seulement sur un loyer en retard.

## Contexte

Réf : **P81.03** du fichier de pistes, `validé` (critère V1 accordé).

`ApplyLateFeesJob::candidateQuery()` n'écartait que `deposit_refund`, et
`LateFeeCalculator::isApplicable()` ne lisait pas `payment_type`. Mesuré avant correctif (test de
garde ci-dessous, `pre-dev` cdef5c26f) : bail à 10 %, une échéance en retard de chaque type
(hors restitution de caution) → le job en pénalise 5 au lieu de 1.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

Choix retenu : la liste la plus étroite, `rent` seul. La piste écrit « `rent`, peut-être
`charges` » ; `docs/features.md` § 1.4 parle de la pénalité d'une « échéance de loyer ».

## Delta à produire

- [x] `ApplyLateFeesJob::candidateQuery()` : `payment_type = rent` (au lieu de
  `exceptDepositRefunds()`, qu'elle contient).
- [x] `LateFeeCalculator::isApplicable()` : `false` hors `rent`.
- [x] Test `ApplyLateFeesJobTest::test_seul_le_loyer_porte_une_penalite_de_retard`.

## Critères d'acceptation

- [x] AC1 — une échéance en retard de chaque type : seul le loyer est pénalisé ; `penalty`,
  `deposit`, `charges`, `regularization` restent `pending`, sans pénalité, et `isApplicable()`
  les refuse.

## Hors périmètre

- Les pénalités déjà posées sur des lignes hors loyer : aucune n'est reprise (ce serait une
  réécriture de données).
- `charges` : à ajouter si le porteur le décide.

## Notes d'implémentation

- Ablation : job et calculateur rendus à `cdef5c26f` → 1 rouge (5 pénalisées au lieu de 1) ;
  remis → la classe entière 5/5.
