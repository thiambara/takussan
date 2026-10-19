---
id: TCK-963
title: "`AgencyUpdateRequest` accepte `booking_pending_expiry_hours` et `tenant_onboarding_enabled`, et un test confronte les clés lues aux règles"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#deux-réglages-de-agenciessettings-sont-lus-mais-rien-ne-peut-les-écrire"
tags: [back, agency, settings, pistes]
---

## Contexte

Réf : **P47.03** du fichier de pistes, `validé` (critère V7 accordé).

`BookingExpirationService` lit `agencies.settings.booking_pending_expiry_hours` et
`TenantOnboardingService` lit `agencies.settings.tenant_onboarding_enabled`, mais
`AgencyUpdateRequest` n'a de règle pour aucune des deux : `validated()` les retire, l'API répond
200 sans rien écrire. Toutes les agences ont donc le défaut, alors que `features.md` § 1.3 décrit
le seuil comme un réglage de l'agence.

## Décision du porteur

> ouvrir les deux clés dans `AgencyUpdateRequest` (`booking_pending_expiry_hours` entier de 0 à 168, `tenant_onboarding_enabled` booléen), avec le test qui confronte les clés de `agencies.settings` lues par `app/` aux règles d'`AgencyUpdateRequest` (porteur, 2026-10-18, sur la recommandation du délégué)

## Reste à faire

> le champ d'écran, son libellé et son emplacement

## Objectif

Un admin d'agence peut écrire les deux réglages par `PATCH /api/agencies/{id}`, et une clé de
`agencies.settings` lue par `app/` sans règle d'écriture fait rougir un test.

## Hypothèses (mode sans humain)

- Les deux règles sont `nullable`, comme `late_fee_online_collection` : une clé à `null` est
  retirée par la fusion de `AgencyController::update` et revient au défaut du code.
- Le test lit les clés dans `app/` par motif (`data_get(…->settings, 'clé'`,
  `$settings['clé']`, `'settings->clé'`) dans les fichiers qui lisent les `settings` d'une
  agence ; il épingle la liste des lecteurs connus pour ne pas être vide.

## Delta à produire

- [x] `AgencyUpdateRequest` : `settings.booking_pending_expiry_hours` (entier 0..168) et
  `settings.tenant_onboarding_enabled` (booléen).
- [x] Test HTTP : les deux clés s'écrivent ; 169, -1 et une chaîne non booléenne → 422.
- [x] Test de confrontation : toute clé de `agencies.settings` lue par `app/` a une règle.

## Critères d'acceptation

- [x] AC1 — `PATCH` avec `booking_pending_expiry_hours: 0` et `tenant_onboarding_enabled: false`
  → 200, et les deux valeurs sont dans `agencies.settings`.
- [x] AC2 — `booking_pending_expiry_hours: 169` ou `-1` → 422 ; `tenant_onboarding_enabled: "x"`
  → 422.
- [x] AC3 — le test de confrontation rougit sur l'arbre d'avant le correctif, en nommant les deux
  clés.

## Hors périmètre

- Le champ d'écran (reste du porteur).
- L'accesseur commun `Agency::setting()` et la coercition de `tenant_onboarding_enabled` (P47.08).

## Notes d'implémentation

- Avant correctif : les 6 tests d'`AgencySettingsWritableTest` rougissent ; la confrontation nomme
  `booking_pending_expiry_hours (Services/Booking/BookingExpirationService.php)` et
  `tenant_onboarding_enabled (Services/Tenant/TenantOnboardingService.php)`.
- Ablation (les deux règles retirées) → 6 rouges ; remises → 6 verts, `AgencySettingsMergeTest`
  vert.
- Le balayage épingle ses cinq lecteurs connus (`LECTEURS_CONNUS`) : un motif qui cesserait de les
  voir rougit au lieu de rendre une liste vide.
