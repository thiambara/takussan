---
id: TCK-2022
title: "La modération d'agence (file, approbation, rejet) exige l'admin de l'agence et properties.publish"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-116--gestes-dagence-jugés-par-le-type-de-profil-au-lieu-dune-capacité"
tags: [api, moderation, authorization, capabilities, pistes]
---

## Contexte

Réf : **P116.05** du fichier de pistes, `validé` (V2 accordé). `PropertyModerationPolicy::canModerate`
(approbation, rejet) et la file `GET /api/properties/moderation` ne jugeaient que
`isAgencyAdminAt` sur l'agence du bien. L'admin dont le rôle retire `properties.publish` lisait la
file et approuvait, ce qui publie le bien (`pending_review` → `available`).

## Décision du porteur

validation du porteur (2026-10-23) : la modération d'agence exige l'admin ET `properties.publish` (`canModerate` et `index`), patron de `AgencyPolicy::updatePayoutThreshold` ; aucun agent ne gagne la modération

## Delta à produire

- [x] `PropertyModerationPolicy::moderatesAt(User, int $agencyId)` : admin de l'agence ET `canActAt(PropertiesPublish, $agency)`.
- [x] `canModerate` la lit (approbation, rejet ; l'approbation garde son verrou plateforme).
- [x] `Admin\PropertyModerationController::index` la lit pour la file.
- [x] Test `ModerationDAgenceExigePublierTest`.

## Critères d'acceptation

- [x] AC1 — Admin dont le rôle retire `properties.publish` : approbation, rejet et file en 403, bien toujours `pending_review`.
- [x] AC2 — Agent qui tient `properties.publish` : mêmes 403.
- [x] AC3 — Admin du rôle système : file 200 (le bien y est), approbation et rejet 200.

## Hors périmètre

- Le front (`/app/agency/moderation/properties`, `lib/queries/property-moderation.ts`) montre
  encore la page à tout admin : un admin sans la capacité y reçoit un 403. Non relu.

## Notes d'implémentation

- Ablation : contrôleur de `pre-dev` seul → 1 rouge (file 200) ; policy de `pre-dev` seule (file comprise remise à l'ancien prédicat) → 1 rouge (approbation 200) ; remis → 4 verts.
- Le test assert l'approbation et le rejet AVANT la file, pour que chaque ablation rougisse sur sa partie.
