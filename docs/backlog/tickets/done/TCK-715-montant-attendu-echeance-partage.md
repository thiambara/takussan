---
id: TCK-715
title: "Rapprochement bancaire : un seul montant attendu d'échéance, partagé par le matcher et la recherche manuelle"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
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
tags: [back, accounting, reconciliation, payments, pistes]
---

## Contexte

Réfs : **P25.01** et **P25.02** du fichier de pistes, toutes deux `validé` par le porteur (critère
accordé : V1). Prises ensemble : même cause (le « montant attendu sur le compte » d'une
`LeasePayment` n'existe nulle part comme règle unique) et même correctif (une expression unique,
qui suit la règle de P25.02).

- P25.01 : TCK-593 a appris au matcher automatique qu'une échéance payée en ligne pénalité comprise
  arrive pour le montant figé (157 500), mais la recherche manuelle comparait `amount` seul
  (150 000). Ouverte au montant de la ligne, elle rendait `[]`.
- P25.02 : après un checkout abandonné puis un règlement manuel (virement), `gateway_expected_amount`
  reste sur la ligne, et le matcher le préférait à `amount` : un crédit de 150 000 restait
  `unmatched`.

## Décision du porteur

P25.01 : une seule expression du montant attendu d'une échéance, partagée par le matcher et la recherche manuelle, et qui suit la règle de P25.02

P25.02 : le montant figé ne se lit que si l'échéance a été soldée en ligne ; sinon `amount`

Hypothèses (mode sans humain) :

- « Soldée en ligne » se lit sur `metadata.gateway.settled_by` : posé à l'identifiant de la
  transaction par `PaymentGatewayService::applyStatusToPayment()` (webhook et `verify()` lui
  passent tous deux la transaction), et à `manual` par `markManualSettlement()`. Une échéance sans
  `settled_by` (jamais soldée, ou soldée par un chemin qui ne le pose pas) n'est pas soldée en
  ligne : `amount`.
- Le « montant figé » reste `metadata.gateway_expected_amount`, celui de la dernière initiation,
  comme le lisait déjà le matcher. La décision ne demande pas le montant de la transaction qui a
  soldé (`gateway.transactions[]`), option que la `Piste` de P25.02 citait entre parenthèses.

## Objectif utilisateur

Le comptable d'agence retrouve une échéance au montant réellement reçu sur le compte, par la
suggestion automatique comme par la recherche manuelle, quel que soit le chemin par lequel elle a
été soldée.

## Contrat de données

Aucun changement d'API ni de schéma. `GET /api/agencies/{agency}/bank-statements/payment-search`
filtre les échéances sur le montant attendu ; le `amount` rendu par candidat reste celui de
l'échéance.

## Contraintes strictes (métier)

- Une seule expression, sur le modèle `LeasePayment`, appelée par les deux services : aucune copie.
- Tolérances inchangées : 0,01 pour le matcher, 1 pour la recherche manuelle.

## Delta à produire

- [x] `LeasePayment::scopeWhereExpectedAmountNear(float $amount, float $tolerance)` : le montant
      figé si `gateway.settled_by` est posé et vaut autre chose que `manual`, sinon `amount`.
- [x] `ReconciliationMatcher::fetchCandidates()` : la branche `LeasePayment` appelle le scope.
- [x] `PaymentSearchService::searchLeasePayments()` : l'indice de montant passe par le scope
      (`BookingPayment` garde `applySearch()` sur `amount`).
- [x] Tests dans `BankReconciliationTest` :
      `test_la_recherche_manuelle_trouve_l_echeance_payee_en_ligne_penalite_comprise` et
      `test_apres_un_checkout_abandonne_puis_un_virement_le_montant_attendu_est_celui_de_l_echeance`.

## Critères d'acceptation

- [x] AC1 (P25.01) — échéance de 150 000 initiée en ligne pénalité comprise et soldée par webhook
      Wave à 157 500 → la recherche manuelle d'un crédit à 157 500 rend cette échéance.
- [x] AC2 (P25.02) — checkout de 157 500 ouvert puis abandonné, loyer enregistré payé par virement
      trois heures plus tard → un crédit de 150 000 à J+1 est suggéré sur l'échéance.
- [x] AC3 — dans le cas de l'AC2, la recherche manuelle trouve l'échéance à 150 000, et ne la
      trouve plus à 157 500.
- [x] AC4 — l'AC14 de TCK-593 (`test_un_credit_penalite_incluse_est_suggere_sur_l_echeance`) et
      les autres tests de `BankReconciliationTest` et `PaymentSearchTest` restent verts.

## Hors périmètre

- Le montant affiché par candidat dans le dialogue de recherche (`MatchCandidate.amount`) reste
  `amount` : 150 000 en face d'une ligne de 157 500 (AC1). Afficher le montant attendu est un choix
  d'écran que la décision ne porte pas.
- Les statuts de facture rapprochables (P25.04), traités à part.
- Le montant de la transaction qui a soldé, quand une initiation plus récente a remplacé
  `gateway_expected_amount` (voir hypothèses).

## Notes d'implémentation

- **Ablation complète** (les trois fichiers d'`app/` remis à `pre-dev` de18f26c) → les deux tests
  neufs rougissent : `Failed asserting that two arrays are identical` (recherche à 157 500 →
  `[]`) et `Suggested` attendu, `Unmatched` obtenu. Correctif remis → verts.
- **Ablation fine** (la condition « soldée en ligne » neutralisée dans le scope, `COALESCE` seul
  comme avant) → seul le test de P25.02 rougit ; celui de P25.01 reste vert. Chaque test garde
  sa moitié de la règle.
- `PaymentGatewayService::SETTLED_MANUALLY` est lu par le modèle plutôt que la chaîne `manual`
  recopiée : la marque n'a qu'une source.
