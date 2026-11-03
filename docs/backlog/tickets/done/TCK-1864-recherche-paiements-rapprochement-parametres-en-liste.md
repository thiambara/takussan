---
id: TCK-1864
title: "La recherche manuelle de paiements du rapprochement rend 422, et non 500, sur `q` ou `direction` en liste"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-188--paramètres-de-date-et-de-nombre-lus-à-la-main-hors-de-filter"
tags: [api, comptabilite, rapprochement, validation, pistes]
---

## Contexte

Réf : **P188.06** du fichier de pistes, `retenu · autonome` (A1). `PaymentSearchController` reçoit
un `Request` nu : `q` part sans contrôle à `PaymentSearchService::search(string $query)` et
`direction` est casté `(string)` avant `tryFrom()`. `q[]=abc` → 500 `TypeError`,
`q=abc&direction[]=credit` → 500 « Array to string conversion ».

## Objectif utilisateur

Un appel mal formé à la recherche de paiements reçoit une erreur de validation sur le paramètre
fautif ; les recherches du comptable ne changent pas.

## Contrat de données

`GET /api/agencies/{agency}/bank-statements/payment-search` : `q` et `direction` doivent être des
chaînes (422 sinon). Une direction inconnue reste ignorée, `amount` reste lu tel quel.

## Delta à produire

- [x] `App\Http\Requests\Accounting\SearchPaymentsRequest` (`q`, `direction` : `nullable|string`),
  dont `authorize()` invoque la policy que le contrôleur juge, pour que le 403 précède le 422.
- [x] `PaymentSearchController` : reçoit cette requête.
- [x] Tests : `PaymentSearchTest::test_q_ou_direction_en_liste_rendent_422_et_non_500` et
  `test_hors_de_l_agence_le_refus_precede_la_validation`.

## Critères d'acceptation

- [x] AC1 — `q[]=abc` → 422 sur `q` ; `q=abc&direction[]=credit` → 422 sur `direction`.
- [x] AC2 — témoins : `amount=abc`, `direction=nope` et `q=` vide → 200.
- [x] AC3 — l'administrateur d'une autre agence, `q[]=abc` → 403.

## Hors périmètre

- Juger `amount` en `numeric` ou `direction` par `Rule::enum` : ferait rendre 422 à des appels
  qui rendent 200 (écarté par la mesure de la piste).

## Notes d'implémentation

- `q=` vide arrive `null` (ConvertEmptyStringsToNull), et `query('q', '')` ne rend le défaut que
  pour une clé absente : le contrôleur caste `(string)` pour que ce cas, accepté par `nullable`,
  n'atteigne pas la signature `string` du service.
- Reproduction : `q[]=abc` → 500 avant correctif.
- Ablation : requête retirée et contrôleur remis à l'état de `pre-dev` → le cas 422 rouge (le
  cas 403 reste vert : le contrôleur autorisait déjà avant de lire) ; correctif remis →
  `PaymentSearchTest` 8 verts. `BankReconciliationCrossAgencyTest` 9 verts,
  `MatchCandidateStatusTest` 2 verts.
