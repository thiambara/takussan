---
id: TCK-778
title: "Réglages d'agence : un seul lecteur `ScopedSetting::value()`, la devise lue sur la colonne, le seeder mort retiré"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#30-setting-"
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons"
tags: [back, settings, paiements, seeders, pistes]
---

## Contexte

Réf : **P13.07** du fichier de pistes, `validé` (critère accordé : V4, avec V1 et V8 cités au même
classement). Le déballage d'une valeur de `settings` (`$value['value'] ?? array_values($value)[0]`)
est recopié dans quatre lecteurs, et un cinquième (les relances de facture) en porte une variante ;
la devise d'un paiement lit d'abord `agencies.settings['currency']`, qu'aucune requête n'écrit et
qu'`AgencyUpdateRequest` ne valide pas, avant la colonne `agencies.currency` ; `SettingsSeeder`
écrit sept clés globales et `branding`, qu'aucun code ne lit.

## Décision du porteur

un seul lecteur ScopedSetting::value() portant le déballage ; la devise lue sur agencies.currency seulement ; clés mortes retirées du seeder ; booking_pending_expiry_hours laissé tel quel

## Delta à produire

- [x] `ScopedSetting::value(string $key, ?int $agencyId): mixed` : la ligne de l'agence, sinon la
      valeur du catalogue (`PlatformSettingService::getValue`), déballée en un seul endroit.
- [x] Les cinq lecteurs (`LateFeeCalculator::capPercent`, `LeaseRenewalService::requireSignatureFlag`,
      `RentReviewService::resolveMaxPct`, `EarlyTerminationService::resolvePenaltyMonths`,
      `OverdueReminderService::offsets`) passent par lui, et ne gardent que leur conversion de type
      et leur défaut.
- [x] `PaymentGatewayService::paymentCurrency()` ne lit plus `agencies.settings['currency']`.
- [x] `SettingsSeeder` est retiré, avec son entrée de `YearOfActivitySeeder` : toutes ses clés sont
      sans lecteur.

## Critères d'acceptation

- [x] AC1 — Pour chaque lecteur, les résultats sont ceux d'avant : `{"value": x}`, la forme héritée
      `{"months": 3}` et une liste d'échéances se lisent comme avant (`ScopedSettingReadersTest`).
- [x] AC2 — Aucune copie du déballage ne reste dans `app/` hors de `ScopedSetting`.
- [x] AC3 — Une agence dont `settings.currency` vaut `EUR` et la colonne `currency` `XOF` paie en
      `XOF`.

## Hors périmètre

- `booking_pending_expiry_hours`, lu dans `agencies.settings` par `BookingExpirationService` (laissé
  tel quel par la décision).
- `PlatformSettingService::unwrap()`, qui déballe le stockage du catalogue global et non une ligne
  d'agence.
- Les lignes déjà semées dans les bases existantes : retirer le seeder ne supprime rien.

## Hypothèses (mode sans humain)

- « portant le déballage » est lu comme « même résultat qu'avant » : le déballage unique garde la
  forme des lecteurs d'agence (`value`, sinon la première valeur d'un objet) et laisse intacte une
  liste quand le catalogue type la clé `integer_list`. La forme de `PlatformSettingService::unwrap()`
  (exactement `['value']`) aurait changé la lecture de `{"months": 3}`.

## Notes d'implémentation

- Ablation : les sept fichiers d'`app/` remis à `pre-dev` → 9 rouges sur 18
  (`ScopedSettingReadersTest`, `PaymentCurrencyFromAgencyColumnTest`) ; correctif remis → 18 verts,
  et les 22 classes qui lisent ces services vertes (237 tests).
- Le type du catalogue décide du déballage d'une liste : sans lui, `[12]` sur une clé scalaire et
  `[3, 9]` sur les échéances ne se lisent pas de la même façon, et les deux copies d'origine
  divergeaient déjà sur ce point.
- La garde de non-recopie interdit aussi `ScopedSetting::agencyRow(` hors de la classe.
