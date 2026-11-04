---
id: TCK-1501
title: "L'essai d'une agence `inactive` ou `suspended` ne se convertit pas en abonnement"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  adr:
    - "docs/adr/0048-effet-d-une-suspension-d-agence.md#amendement-du-2026-10-22--une-agence-ne-se-supprime-pas-elle-sort-du-cycle-de-vie-par-son-statut"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-129--suppression-douce-dune-agence"
tags: [back, facturation, abonnement, pistes]
---

## Contexte

Réf : **P129.05** du fichier de pistes, `validé` (critère V1 accordé).

`AgencySubscriptionService::processTrialExpirations` passait tout essai échu `trialing` → `active`
sans lire le statut de l'agence : une agence sortie d'activité commençait à être facturée.

## Décision du porteur

validé — porteur (2026-10-22) : la suppression est réglée par P129.06 (ADR-0048, amendement du 2026-10-22) ; pour une agence `inactive` ou `suspended`, `processTrialExpirations` saute l'agence et ne convertit pas l'essai, qui se convertit au premier passage après le retour à `active` (même amendement) ; test du job par statut

## Delta

- [x] `processTrialExpirations` : les identifiants sont pris parmi les abonnements dont l'agence
  est `active` (`whereHas('agency', status = active)`). Rien n'est écrit sur l'essai sauté : il
  reste `trialing`, échu, et le premier passage après le retour à `active` le convertit.
- [x] `FinDEssaiParStatutDAgenceTest` : un cas par statut, et le retour à `active`.

## Hypothèse

- Une agence supprimée en douceur (s'il en reste, ADR-0048) est aussi sautée : `whereHas` applique
  la portée `SoftDeletes`. Aucune agence ne se supprime plus par l'API (TCK-1499).

## Notes d'implémentation

- Ablation : `whereHas` retiré → 3 rouges sur 4, remis → 4/4. `BillingPlansTest` 13/13 et
  `RenewAgencySubscriptionPeriodsTest` 3/3.
