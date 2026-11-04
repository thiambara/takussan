---
id: TCK-1526
title: "Le candidat au rapprochement rend et affiche le statut de son payable"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1522]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#41-bankstatementline-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#petites-améliorations-62"
tags: [api, front, reconciliation, pistes]
---

## Contexte

Réf : **P110.04** du fichier de pistes, `validé`. Un acompte remboursé avant l'import du relevé
reste suggéré (confiance 70) et trouvé par la recherche manuelle, sans rien qui dise qu'il est
remboursé. Versant affichage de P110.02 (TCK-1522).

## Décision du porteur

validé — porteur (2026-10-22) : rendre le statut du payable dans `MatchCandidate`, sa ressource et la suggestion, affiché en badge avec les libellés déjà traduits, sans écarter le candidat ni refuser la confirmation (versant affichage de P110.02)

## Objectif utilisateur

En choisissant à la main le paiement à rapprocher, l'agence voit le statut de chaque candidat,
remboursé compris.

## Contrat de données

`GET /api/agencies/{agency}/bank-statements/payment-search` rend `status` pour chaque candidat
(valeur de l'enum de statut de son type). La suggestion le rend par sa ligne :
`matched_payment_status` d'une ligne `suggested` (TCK-1522).

## Contraintes strictes (métier)

- Aucun candidat n'est écarté, aucune confirmation n'est refusée.

## Delta à produire

- [x] `MatchCandidate::$status`, renseigné par les cinq recherches de `PaymentSearchService`.
- [x] `MatchCandidateResource` rend `status`.
- [x] Front : `PayableStatusBadge` (TCK-1522) sur chaque candidat de `PaymentSearchDialog`.
- [x] Tests : `MatchCandidateStatusTest` (API), `rapprochement.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — la recherche rend l'acompte remboursé avec `status = refunded`, la facture envoyée
  avec `sent`.
- [x] AC2 — la suggestion sur un acompte remboursé rend `matched_payment_status = refunded`.
- [x] AC3 — le dialogue affiche « Remboursé » et « Envoyée », et le candidat remboursé reste
  choisissable.

## Hors périmètre

- `unmatch` qui libère un payable remboursé (constat mineur de la piste, sans effet sur le statut).
- P25.07 au-delà du statut (écart de montant dans la recherche).

## Notes d'implémentation

- Choix : « la suggestion » est rendue par la ligne qui la porte (`matched_payment_status`,
  TCK-1522), seul canal par lequel une suggestion atteint le client. `MatchSuggestion` n'est pas
  touché : un champ sans lecteur y serait mort. AC2 est déjà vert après TCK-1522 ; le test le garde.
- Ablations : `status` retiré de `MatchCandidateResource` → AC1 rouge ; badge absent du dialogue →
  AC3 rouge (`statut-candidat-booking_payment-7` introuvable).
