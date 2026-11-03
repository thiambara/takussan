---
id: TCK-1381
title: "Renouvellement de bail : la pénalité de retard et le délai de grâce hérités du parent se voient et se pré-remplissent"
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
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#14-lease-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-133--estimations-et-aperçus-calculés-au-front-face-au-calcul-de-lapi"
tags: [api, web, leases, renewal, pistes]
---

## Contexte

Réf : **P133.04** du fichier de pistes, `validé` par le porteur (critère accordé : V1, et le choix
V7 sur un champ vidé). `LeaseRenewalService` reprend `late_fee_percent` et `late_fee_grace_days` du
bail d'origine quand ils ne sont pas envoyés, mais `LeaseResource` ne les rend pas : le dialogue de
renouvellement part de champs vides et son récapitulatif écrit « — → — ».

## Décision du porteur

> validé — porteur (2026-10-22) : le bail renouvelé reprend la pénalité de retard et le délai de grâce du bail d'origine

## Objectif

Le récapitulatif du renouvellement dit la pénalité et le délai que le nouveau bail portera.

## Delta à produire

- [x] `LeaseResource` rend `late_fee_percent` (décimal) et `late_fee_grace_days` (entier), `null` sans valeur.
- [x] `Lease` (type front) les déclare, optionnels.
- [x] `LeaseRenewalDialog` les pré-remplit depuis le parent, comme le loyer et la caution ; le
      récapitulatif montre la valeur du parent, et ne surligne qu'une valeur saisie qui en diffère.
- [x] Un champ vidé n'est pas envoyé : l'API reprend la valeur du parent, que le récapitulatif affiche
      (conforme à la décision : le bail renouvelé la reprend).

## Critères d'acceptation

- [x] AC1 — `GET /api/leases/{id}` d'un bail à 5 % et 7 jours rend ces deux valeurs ; `null` sans pénalité.
- [x] AC2 — Parent à 5 % et 7 jours : les champs du dialogue valent 5 et 7, et le récapitulatif les
      montre sans « — », non surlignés.
- [x] AC3 — Passée à 8 %, la ligne montre 5 et 8, surlignée.

## Notes d'implémentation

- Ablation API : `LeaseResource` remis à l'état d'avant → `LeaseLateFeeExposedTest` 2 rouges ; remis → verts.
- Ablation front : dialogue remis à l'état d'avant → les 3 tests neufs rougissent ; remis → verts.
- La réponse JSON rend `5.0` en `5` : le test compare par `assertEquals`.
