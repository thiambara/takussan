---
id: TCK-2122
title: "L'historique unifié des paiements ne rend plus 500 sur un statut, un type d'entité ou un tri en liste"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-216--paramètres-lus-à-la-main-en-chaîne-hors-de-buildquery-reçus-en-liste"
tags: [api, paiements, validation, pistes]
---

## Contexte

Réf : **P216.02** du fichier de pistes, `retenu · autonome` (A1). `PaymentController::history`
caste `(string)` `filter[entity_type]`, `filter[status]` et `sort` : une valeur en liste rend 500
« Array to string conversion ». Un statut inconnu rend déjà 422 `payment.filter_status_invalid`,
et un type ou un tri inconnus sont déjà ignorés.

## Objectif utilisateur

Un appel mal formé à l'historique des paiements reçoit la réponse d'une valeur inconnue, au lieu
d'accuser le serveur. Aucun montant ni aucune autorisation ne changent.

## Contrat de données

Aucun changement pour une valeur en chaîne. `filter[status]` en liste → 422
`payment.filter_status_invalid` ; `filter[entity_type]` en liste → pas de filtre d'entité ;
`sort` en liste → `-date`.

## Delta à produire

- [x] `PaymentController::history` : `is_array()` avant chacun des trois casts.
- [x] Test : `tests/Feature/Api/ValeursEnListeHistoriqueDesPaiementsTest.php` (un cas par
  paramètre).

## Critères d'acceptation

- [x] AC1 — `payments/history?filter[status][]=paid` → 422 `payment.filter_status_invalid`.
- [x] AC2 — `filter[entity_type][]=lease&filter[entity_id]=1` → 200.
- [x] AC3 — `sort[]=amount` → 200.

## Hors périmètre

- `filter[entity_id][]=5` ne lève rien mais se lit `(int) [...]` = 1 : non cité par la piste,
  laissé au rapport.

## Notes d'implémentation

- Reproduction : les trois tests neufs rouges avant correctif, « Array to string conversion »
  (l. 91, 79, 125).
- Ablation : contrôleur remis à l'état de `pre-dev` → 3 rouges ; correctif remis → 3 verts.
  `PaymentHistoryTest` 11, `DateIllisibleDansUnFiltreTest` 8, `TimestampDayRangeTest` 10 et
  `ControllerInstantFormTest` 2 verts.
