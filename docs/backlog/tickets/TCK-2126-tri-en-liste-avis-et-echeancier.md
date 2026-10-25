---
id: TCK-2126
title: "Le tri de la file des avis et celui de l'échéancier d'un bail ne rendent plus 500 sur `sort` en liste"
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
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-216--paramètres-lus-à-la-main-en-chaîne-hors-de-buildquery-reçus-en-liste"
tags: [api, avis, baux, validation, pistes]
---

## Contexte

Réf : **P216.04** du fichier de pistes, `retenu · autonome` (A1). `ReviewController::index` et
`LeasePaymentController::index` castent `(string)` leur `sort` : `sort[]=…` rend 500 « Array to
string conversion ». Un tri inconnu a déjà sa réponse (ignoré, ordre par défaut), et le même
contrôleur des avis traite déjà `filter[moderation_status]` en liste par `is_string()` (TCK-1407).

## Objectif utilisateur

Un tri mal formé est servi dans l'ordre par défaut, au lieu d'accuser le serveur.

## Contrat de données

Aucun changement pour une valeur en chaîne ou vide. `sort` en liste : `-reported_count,-created_at`
pour les avis, `period_start` décroissant pour l'échéancier.

## Delta à produire

- [x] Les deux contrôleurs : `is_string()` avant le cast.
- [x] Test : `tests/Feature/Api/ValeursEnListeTriDesAvisEtDeLEcheancierTest.php` (un cas par route).

## Critères d'acceptation

- [x] AC1 — `reviews?sort[]=rating` → 200.
- [x] AC2 — `leases/{id}/payments?sort[]=due_date` → 200, dans l'ordre par défaut.

## Notes d'implémentation

- Reproduction : les deux tests neufs rouges avant correctif, « Array to string conversion »
  (`ReviewController.php:113`, `LeasePaymentController.php:40`).
- Ablation : contrôleurs remis à l'état de `pre-dev` → 2 rouges ; correctif remis → 2 verts.
- Voisins verts : `LeasePaymentIndexSortTest` 3, `LeasePaymentResourceContractTest` 11,
  `ReviewModerationQueueTest` 10, `ReviewModerationScopeTest` 16, `ReviewTest` 15,
  `ReviewFlagsQueryCountTest` 11.
