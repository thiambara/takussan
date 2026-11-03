---
id: TCK-1419
title: "GET /api/me/payouts/{id} : l'agence lit la ventilation d'un reversement de la plateforme"
status: done
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#45-platformpayout-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-141--encaissements-soldés-par-la-plateforme-face-au-relevé-bancaire-de-lagence"
tags: [api, plateforme, reversement, pistes]
---

## Contexte

Réf : **P141.03** du fichier de pistes, `validé`.

`GET /api/me/payouts` rendait les reversements de la plateforme sans leur ventilation : seule la
console (`Admin/PlatformPayoutController::show`) la calculait. L'agence ne savait pas ce qu'un
virement de la plateforme couvrait.

## Décision du porteur

« validé — porteur (2026-10-22) : d'abord `GET /api/me/payouts/{id}` sous `viewPlatformPayouts`, qui rend le `breakdown` déjà calculé ; l'avis à l'agence au `markPaid` et l'indication « encaissé par la plateforme » ensuite »

Critère accordé : V7.

## Objectif

L'agence lit, pour un de ses reversements, la ventilation que la console lit déjà.

## Delta à produire

- [x] Route `GET /api/me/payouts/{payout}` (`me.payouts.show`), action `show` de
      `Api\Me\PlatformPayoutController` : même garde que la liste (`viewPlatformPayouts` sur l'agence
      du profil actif), reversement cherché dans cette seule agence, `breakdown` de
      `PlatformPayoutService::breakdown()` sans calcul neuf.
- [x] Tests dans `MePlatformPayoutAccessTest`.

## Critères d'acceptation

- [x] AC1 — L'admin de l'agence lit `data.breakdown` (deux loyers de 150 000 et 100 000 à 5 % →
      `lease.count = 2`, `gross = 250000`, `fees = 12500`).
- [x] AC2 — Un agent sans `agency.update_billing` → 403 ; le reversement d'une autre agence → 404.

## Reste à faire

- **L'avis à l'agence au `markPaid` et l'indication « encaissé par la plateforme » sur le
  rapprochement**, que la décision place « ensuite » : ils demandent un texte neuf (avis, libellé)
  que le porteur n'a pas donné. Non faits.

## Hors périmètre

- L'écran du front qui lirait cette route.

## Notes d'implémentation

- La garde d'agence de `index` est passée dans un helper privé partagé par les deux actions ; la
  règle reste la policy (`viewPlatformPayouts`).
- Ablation : contrôleur et route remis à l'état d'avant → 2 rouges (404 au lieu de 200 et de 403) ;
  correctif remis → 5 verts.
