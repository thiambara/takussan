---
id: TCK-1315
title: "PATCH /api/me/profiles/{id}/trades : `hourly_rate: null` efface le taux horaire, comme `visit_fee`"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-117--clés-de-metadata-des-profils-écrites-par-les-assistants"
tags: [api, prestataire, profil, pistes]
---

## Contexte

Réf : **P117.02** du fichier de pistes, `validé` (V1 accordé).

La section « Tarifs » du profil prestataire envoie `hourly_rate: null` quand le champ est vidé.
`ServiceProviderProfileController::updateTrades` lisait ce `null` comme « garder » : le taux
reparaissait au rechargement. La clé voisine `visit_fee` distingue déjà clé absente et `null`.

## Décision du porteur

> porteur (2026-10-22) : `hourly_rate` comme `visit_fee` : clé absente, on garde ; `null`, on efface

## Objectif

`hourly_rate` absent garde `hourly_rate_min` ; `hourly_rate: null` le remet à `null`.

## Delta à produire

- [x] `updateTrades` : `null` explicite écrit `null` dans `hourly_rate_min`.
- [x] Cas ajouté à `ServiceProviderTradesPartialUpdateTest`.

## Critères d'acceptation

- [x] AC1 — `PATCH …/trades {trades: [...]}` garde `hourly_rate_min`.
- [x] AC2 — `PATCH …/trades {hourly_rate: null}` rend `data.hourly_rate: null` et vide la colonne.

## Hors périmètre

- Le même motif ailleurs (angle 149 proposé par l'explorateur).

## Notes d'implémentation

- Ablation : avec l'ancien ternaire, `test_null_hourly_rate_clears_it_and_an_absent_key_keeps_it`
  rouge (`'5000.00'` au lieu de `null`) ; correctif remis → vert.
  `ServiceProviderOnboardingTest` vert (l'assistant envoie aussi `null` pour un champ vide, sur un
  profil neuf).
