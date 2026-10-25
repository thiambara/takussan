---
id: TCK-2024
title: "Configurer l'agence (fiche, logo, réglages, intégrations, mise en service) exige agency.update"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-1701]
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116--gestes-dagence-jugés-par-le-type-de-profil-au-lieu-dune-capacité"
tags: [api, agency, settings, integrations, authorization, capabilities, pistes]
---

## Contexte

Réf : **P116.02** du fichier de pistes, `validé` (V2 accordé). La fiche de l'agence
(`PATCH /api/agencies/{a}`), son logo, ses réglages (`/api/settings`), ses intégrations
(`/api/integrations`) et la carte de mise en service jugeaient tous « admin de l'agence »
(`AgencyPolicy::update` ou `isAgencyAdminAt` recopié), jamais `agency.update`. L'admin dont le
rôle personnalisé retire la capacité les configurait. Depuis TCK-1701, `agency.update` n'est plus
à l'inventaire de `check-capability-readers` : aucun cliquet à baisser.

## Décision du porteur

validation du porteur (2026-10-23) : une ability `AgencyPolicy::configure` (`update()` et `canActAt(AgencyUpdate)`, passe du `primary_admin_id`, comme `AgencyIndicatorPolicy`) sur le PATCH de l'agence, le logo, les réglages, les intégrations et la carte de mise en service ; `listMembers` reste sur `update()` ; plus rien ne bloque depuis TCK-1701

## Delta à produire

- [x] `AgencyPolicy::configure` : super-admin, admin principal, ou `update()` ET `canActAt(AgencyUpdate, $agency)`.
- [x] `AgencyPolicy::attachMedia` → `configure` (le logo, seule collection de l'agence ; `MediaController::authorizeAttach` la préfère à `update`).
- [x] `AgencyController::update` et `AgencyUpdateRequest::authorize` → `configure`.
- [x] `AgencySetupStatusController` → `configure`.
- [x] Réglages : `SettingController::index`/`destroy`, `StoreSettingRequest`, `UpdateSettingRequest` → `configure` à la place d'`isAgencyAdminAt`.
- [x] Intégrations : `IntegrationController::index`/`paymentProviders`/`store`/`destroy`/`test`, `UpdateIntegrationRequest::mayManage` (lue aussi par le point de webhook) → `configure`.
- [x] `listMembers` reste sur `update()`.
- [x] Test `ConfigurerLAgenceExigeAgencyUpdateTest`.

## Critères d'acceptation

- [x] AC1 — Admin dont le rôle retire `agency.update` : les 14 gestes en 403 (fiche, logo, mise en service, réglages ×4, intégrations ×7), rien d'écrit.
- [x] AC2 — Agent qui tient `agency.update` : les mêmes 403.
- [x] AC3 — Admin du rôle système : tous en 2xx.
- [x] AC4 — Admin principal dont le rôle retire la capacité : fiche, réglages et intégrations en 200.
- [x] AC5 — `GET /api/agencies/{a}/members` reste 200 pour l'admin sans la capacité.

## Hors périmètre

- La suppression du logo (`MediaPolicy::delete`, branche `agency_id`) : une `Agency` n'a pas de
  colonne `agency_id`, la branche ne la vise pas (reste de P116.06).
- `docs/ardoise.md` (D-69) et l'inventaire : `agency.update` n'y figure plus.
- Le front, qui montre ces écrans à tout admin : un admin sans la capacité y reçoit des 403. Non relu.

## Notes d'implémentation

- Ablation : les neuf fichiers de `app/` remis à `pre-dev` → 1 rouge (les 14 gestes en 2xx pour l'admin sans la capacité) ; remis → 5 verts.
- `can('configure', Agency::query()->find($id))` sur une agence introuvable rend faux (aucune policy pour `null`) ; le super-admin passe par `Gate::before`.
