---
id: TCK-1833
title: "Badge « échéances en retard » de la fiche du bail compté sur `is_overdue`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1831]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-183--statuts-recalculés-par-le-navigateur-à-partir-des-dates"
tags: [front, leases, payments, pistes]
---

## Contexte

Réf : **P183.02** du fichier de pistes, `validé (délégué)` (V7 accordé, tranché avec P183.01).

`latePaymentsCount` de `LeaseDetail` comptait toute ligne `late` et toute `pending` dont
`new Date(due_date) < new Date()`, sans regarder `payment_type` ni `partially_paid` : une
restitution de caution échue (due par l'agence) et l'échéance du jour comptaient comme retards du
locataire, une `partially_paid` échue n'y était pas. Les impayés de l'API (`OWED_STATUSES`,
`PortfolioMetrics::overdue`) et `docs/features.md` (« Impayé = échéance échue non payée » ; une
restitution n'est jamais une échéance à payer) disent l'inverse sur les trois points.

## Décision du porteur (déléguée)

`latePaymentsCount` de `LeaseDetail` compte les seules échéances dont `is_overdue` (servi par l'API, décision de P183.01) est vrai : restitutions exclues, échéance du jour exclue, `partially_paid` échu compté ; aucune troisième copie de la règle au front. Garde : le test de la piste (restitution `pending` échue, échéance du jour, `partially_paid` échu → badge à 1)

## Delta à produire

- [x] `LeaseDetail` : `latePaymentsCount` compte les échéances dont `is_overdue` (TCK-1831) est
      vrai, sans comparaison de date au navigateur.
- [x] Test neuf `LeaseDetail.retards.test.tsx` : restitution `pending` échue, échéance du jour,
      `partially_paid` échue → « 1 en retard » ; échéance du jour seule → pas de badge.

## Critères d'acceptation

- [x] AC1 — Avec une restitution `pending` échue, une échéance du jour et une `partially_paid`
      échue, le badge affiche « 1 en retard ».

## Notes d'implémentation

- Ablation : l'ancien `latePaymentsCount` remis → 2 rouges (« 2 en retard », puis « 1 en retard »
  pour l'échéance du jour seule) ; remis → 2/2.
- Le `useMemo` est retiré avec le calcul : le React Compiler mémoïse (ADR-0015).
