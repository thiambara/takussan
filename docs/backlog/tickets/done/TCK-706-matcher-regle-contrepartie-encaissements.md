---
id: TCK-706
title: "Rapprochement bancaire : la règle « contrepartie ≥ 85 % » s'applique aux encaissements"
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
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-25--rapprochement-bancaire-quand-une-pénalité-est-incluse-dans-lencaissement
tags: [back, accounting, reconciliation, pistes]
---

## Contexte

Réf : **P25.03** du fichier de pistes, `retenu · autonome` (classement A1 : la règle 80 est déjà
écrite dans `ReconciliationMatcher::scoreCandidate()`).

`ReconciliationMatcher::fetchCandidates()` chargeait les encaissements candidats sans la clé du
payeur (`payer_id` pour `BookingPayment` et `LeasePayment`, `customer_id` pour `Invoice`).
`resolvePayerName()` lisait alors une relation `null`, sans erreur, et la règle « montant exact +
contrepartie ≥ 85 % → 80 » ne s'appliquait jamais à un crédit. Seuls les reversements (débits),
qui chargent `landlord_id`, en bénéficiaient.

Hypothèse (mode sans humain) : le correctif ne change que la confiance d'une **suggestion** ; aucune
confirmation n'est automatique (`BankStatementLine::scopeReadyToConfirm` n'a aucun appelant dans
`app/`, relevé du mesureur), et aucun montant n'est calculé ni écrit. Pas de critère V1.

## Objectif utilisateur

Un crédit dont la contrepartie nomme le payeur d'un encaissement est suggéré avec la confiance 80
que l'algorithme prévoit, au lieu de 60.

## Contrat de données

Aucun changement d'API ni de schéma : `match_confidence` prend la valeur 80 là où elle prenait 60.

## Delta à produire

- [x] `ReconciliationMatcher::fetchCandidates()` : charger `payer_id` / `customer_id`, et la
      relation du payeur par `with()` (colonnes `id`, `first_name`, `last_name`), pour ne pas
      ajouter un N+1.
- [x] Test : `BankReconciliationTest::test_la_regle_contrepartie_s_applique_aux_encaissements`,
      sur les trois modèles d'encaissement.

## Critères d'acceptation

- [x] AC1 — un `LeasePayment` payé de 150 000, un crédit de 150 000 à J+5 dont la contrepartie est
      le nom complet du payeur → suggestion sur l'échéance, confiance 80.
- [x] AC2 — même chose pour un `BookingPayment` (payeur) et une `Invoice` (client).
- [x] AC3 — les autres tests de `BankReconciliationTest` restent verts.

## Hors périmètre

- La branche des reversements : `landlord` y est chargé paresseusement, une requête par candidat
  (N+1 non mesuré).
- Les statuts de facture rapprochables (P25.04, à valider).

## Notes d'implémentation

- **Ablation** : `ReconciliationMatcher.php` remis à `pre-dev` → le test neuf rougit
  (`LeasePayment : la règle contrepartie ne s'applique pas. Failed asserting that 60 is identical
  to 80.`) ; correctif remis → vert, et les 16 tests de la classe verts.
- Le crédit est posé à J+5 exprès : à ±2 jours, la règle 70 masquerait l'absence de la règle 80
  dans un test qui n'asserterait que `>= 70`.
