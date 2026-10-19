---
id: TCK-964
title: "Une ligne d'agence de `POST /api/settings` est validée par le catalogue, et les lecteurs bornent aux limites du catalogue"
status: todo
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
    - "docs/features.md#14-location-longue-durée-baux"
  models:
    - "docs/models-spec.md#30-setting-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#post-apisettings-pose-une-ligne-dagence-hors-des-règles-du-catalogue"
tags: [back, settings, leases, pistes]
---

## Contexte

Réf : **P47.04** du fichier de pistes, `validé` (critère V1 accordé).

Le catalogue (`EditablePlatformSettings`, ADR-0065) borne les réglages métier `rentals`, mais ses
règles ne valent que pour la ligne globale. La ligne d'agence, qui l'emporte (`ScopedSetting`),
s'écrit par `POST /api/settings`, dont `StoreSettingRequest` n'exige qu'une `key` et une `value`
tableau : `lease.rent_review_max_pct = 500` ou `lease.early_termination_penalty_months = 99`
passent en 201, et `resolveMaxPct`, `resolvePenaltyMonths` les rendent tels quels.

## Décision du porteur

> une ligne d'agence de `POST /api/settings` est validée par les `rules` et l'`item_rules` de sa clé au catalogue, et une clé hors catalogue est refusée en 422 (`GenericSettingsCatalogueBypassTest::test_la_portee_agence_reste_ouverte` change d'attendu, sans être supprimé) ; les lecteurs (`resolveMaxPct`, `resolvePenaltyMonths`, plafond des pénalités) bornent aussi aux limites du catalogue, pour qu'une valeur déjà écrite hors borne retombe sur la borne (porteur, 2026-10-18)

## Objectif

Une ligne d'agence ne s'écrit que pour une clé du catalogue, dans ses bornes ; une ligne déjà
écrite hors borne se lit ramenée à la borne.

## Hypothèses (mode sans humain)

- « Au catalogue » s'entend des clés de la catégorie `rentals`, les seules à repli par agence (la
  `Piste` le précise, ADR-0065) : une clé du catalogue d'une autre catégorie (`credits.*`,
  `currency.*`) n'a pas de lecteur par agence, et se refuse comme une clé hors catalogue.
- La valeur validée est celle que lira `ScopedSetting::value()` : l'enveloppe `{"value": …}` est
  déballée par la même fonction.
- L'autorisation de `store` passe dans `StoreSettingRequest::authorize()`, mêmes règles et mêmes
  codes : sans cela, un agent qui poste une clé hors catalogue recevrait 422 au lieu de 403
  (`takussan-api/CLAUDE.md`, « Validation », piège 2).
- Les bornes lues par les lecteurs sont les `min:`/`max:` des `rules` du catalogue, une seule
  source.

## Delta à produire

- [ ] `StoreSettingRequest` : autorisation déplacée ; en portée `agency`, clé `rentals` exigée et
  valeur validée par `rules`/`item_rules`.
- [ ] `ScopedSetting::unwrap()` : le déballage partagé par le lecteur et la validation.
- [ ] `EditablePlatformSettings::clamp()` ; `resolveMaxPct`, `resolvePenaltyMonths` et le plafond
  de `LateFeeCalculator` bornent.
- [ ] `GenericSettingsCatalogueBypassTest::test_la_portee_agence_reste_ouverte` et `SettingTest`
  suivent la décision.

## Critères d'acceptation

- [ ] AC1 — en admin d'agence, `rent_review_max_pct = 500`, `cap_percent = 1000`,
  `early_termination_penalty_months = 99`, `reminder_offsets_days = "abc"` → 422.
- [ ] AC2 — `site_name` et `credits.welcome_amount` en portée agence → 422 sur `key`.
- [ ] AC3 — un agent qui poste une clé hors catalogue reçoit toujours 403.
- [ ] AC4 — une ligne d'agence déjà écrite à 500 / 99 / 1000 se lit 100 / 24 / 100.

## Hors périmètre

- `PUT /api/settings/{id}` d'une ligne d'agence (la décision ne vise que `POST`).
- La lecture `GET /api/settings` (P47.05).

## Notes d'implémentation

_(à remplir par implementing-specs)_
