---
id: TCK-833
title: "Rapprochement : une échéance soldée hors ligne est attendue pénalité comprise quand la pénalité est réglée le même jour"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#15-leasepayment-"
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-25--rapprochement-bancaire-quand-une-pénalité-est-incluse-dans-lencaissement
tags: [back, accounting, reconciliation, late-fee, pistes]
---

## Contexte

Réf : **P25.06** du fichier de pistes, `validé` (V1 accordé).

Une pénalité réglée hors ligne n'est pas un encaissement à part : `LateFeeSettlement::markPaid()`
pose `late_fee_paid_at` sur l'échéance, rien d'autre. Le montant attendu sur le compte
(`LeasePayment::scopeWhereExpectedAmountNear()`, partagé par le matcher et la recherche manuelle)
restait `amount` pour une échéance soldée hors ligne. Un virement unique de 157 500 (loyer de
150 000 et pénalité de 7 500, réglés le même jour) restait donc `unmatched`, et la recherche
manuelle au montant de la ligne ne rendait rien.

## Décision du porteur

validé — le montant attendu inclut la pénalité réglée le même jour ; reste : rendre rapprochable une pénalité réglée seule

## Reste à faire

rendre rapprochable une pénalité réglée seule

## Objectif utilisateur

Le virement qui règle ensemble un loyer en retard et sa pénalité est suggéré sur l'échéance, et
la recherche manuelle le retrouve au montant de la ligne.

## Contraintes strictes

- Une seule expression, sur le modèle : le matcher et la recherche manuelle la partagent (TCK-715).
- Le cas soldé en ligne ne change pas : le montant figé du checkout porte déjà la pénalité quand
  l'agence l'encaisse en ligne (TCK-593).
- Aucune migration.

## Hypothèses (mode sans humain)

- **« Le même jour »** se juge sur la date calendaire de `paid_at` et de `late_fee_paid_at`,
  dans le fuseau de l'application (`UTC`, celui de Dakar).
- Une pénalité réglée un autre jour n'entre pas dans le montant attendu du loyer : elle reste
  dans le « reste à faire ».

## Delta à produire

- [x] `LeasePayment::scopeWhereExpectedAmountNear()` : hors ligne, `amount` + `late_fee_amount`
      quand `late_fee_paid_at` et `paid_at` tombent le même jour.
- [x] `tests/Feature/Api/Accounting/ReconciliationLateFeeSameDayTest.php`.

## Critères d'acceptation

- [x] AC1 — Loyer de 150 000 marqué payé par virement, pénalité de 7 500 marquée réglée le même
      jour : un crédit de 157 500 est `suggested` sur l'échéance, et la recherche manuelle à
      157 500 la rend.
- [x] AC2 — Pénalité réglée deux jours plus tard : le crédit de 157 500 reste `unmatched`, la
      recherche à 150 000 rend l'échéance.
- [x] AC3 — Sans pénalité réglée : un crédit de 150 000 est suggéré, la recherche à 157 500 ne
      rend rien.

## Hors périmètre

- Une pénalité réglée seule, rapprochable comme un objet à part : reste du porteur.
- `LeasePayment::expectedBankAmount()`, que la PR #594 (TCK-828, ouverte) ajoute pour journaliser
  l'écart à la confirmation : il recopie l'expression en PHP et devra suivre ce ticket une fois
  les deux fusionnés.

## Notes d'implémentation

- **Ablation** : la branche hors ligne ramenée à `amount`, AC1 rougit (`unmatched` au lieu de
  `suggested`), AC2 et AC3 restent verts (attendu, ce sont les témoins). Remis : 3 verts, et
  `BankReconciliationTest` et `PaymentSearchTest` restent verts (29 tests en tout).
- Dans le test, l'administrateur de la recherche se crée avec `agency_id` (accesseur de pont) :
  sans lui, la route rend 403.
