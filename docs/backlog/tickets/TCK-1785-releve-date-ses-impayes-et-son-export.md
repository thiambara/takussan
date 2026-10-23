---
id: TCK-1785
title: "Le relevé de gérance date ses impayés, et son CSV porte le total versé et sa date de rendu"
status: done
phase: P1
family: applicatif
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-177--relevés-de-gérance-dune-période-close-recalculés-à-chaque-lecture"
tags: [api, payouts, pdf, csv, pistes]
---

## Objectif utilisateur

Le bailleur qui lit un relevé d'un mois passé sait à quelle date ses impayés ont été jugés, et
deux exports CSV d'un même mois pris à des dates différentes se distinguent et portent le total
versé.

## Contexte

Réf : **P177.06** du fichier de pistes.

## Décision du porteur (déléguée)

> validé (délégué) — dater les impayés sans changer leur règle : `unpaid.as_of` (date du rendu) dans le JSON, et sur le PDF une clé neuve `money_out.statement.unpaid_as_of` (« au :date », JJ/MM/AAAA) après « Impayés de la période », la clé existante restant intacte ; au CSV, deux lignes ajoutées après `totals` dans le même format `type;…` : `paid_out` (total `totals.paid_out` en colonne `amount`) et `generated_at` (date et heure du rendu en colonne `paid_at`), l'en-tête restant la première ligne

## Hypothèses (mode sans humain)

- `unpaid.as_of` est la date du jour du rendu au format `AAAA-MM-JJ` (la date à laquelle la règle
  existante juge « échu »).
- `generated_at` s'écrit en ISO 8601, comme `processed_at` des lignes `payouts` du même CSV.
- La clé neuve vaut « au :date » en `fr`, « as of :date » en `en`, et le français tel quel en `wo`
  (wolof en pause).

## Delta à produire

- [x] `OwnerStatementService::unpaid()` rend `as_of`.
- [x] `pdf/statements/owner.blade.php` écrit « Impayés de la période au JJ/MM/AAAA ».
- [x] Clé `money_out.statement.unpaid_as_of` dans `lang/{fr,en,wo}`.
- [x] `OwnerStatementController::csv()` ajoute `paid_out` et `generated_at` après `totals`.
- [x] Garde dans `tests/Feature/Api/OwnerStatementTest.php`.

## Critères d'acceptation

- [x] AC1 — Le JSON du relevé de septembre lu le 2026-10-02 porte `unpaid.as_of = 2026-10-02`, et
  la règle des impayés est inchangée.
- [x] AC2 — Le PDF porte « Impayés de la période au 02/10/2026 ».
- [x] AC3 — Le CSV garde l'en-tête en première ligne ; après `totals` viennent
  `paid_out;;;;<totals.paid_out>;` puis `generated_at;;;<date et heure du rendu>;;`.

## Hors périmètre

- La règle des impayés, les montants du relevé (P177.01 à P177.03) et sa conservation (P177.05).

## Notes d'implémentation

- Reproduit avant correctif sur `663fc2871` : le test rend « Undefined array key "as_of" ».
- Ablation, volet par volet : service seul remis → `as_of` absent ; gabarit seul remis → la phrase
  « Impayés de la période au 02/10/2026 : 1 » manque au PDF ; contrôleur seul remis → les trois
  dernières lignes du CSV ne sont plus `totals`, `paid_out`, `generated_at`. Rétabli → vert.
- La date du PDF se formate sans `->utc()`, à la différence de `$frDate` du gabarit : `as_of` est
  une date sans heure, qu'un passage en UTC pourrait décaler d'un jour.
