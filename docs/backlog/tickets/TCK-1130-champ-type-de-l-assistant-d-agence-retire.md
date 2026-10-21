---
id: TCK-1130
title: "L'assistant de création d'agence ne propose plus le champ « Type », que rien ne lisait"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-83--clés-des-colonnes-json-hors-agenciessettings"
tags: [back, front, super-admin, agencies, pistes]
---

## Contexte

Réf : **P83.01** du fichier de pistes, `validé (délégué)` (V7 accordé : retrait d'un champ
visible sans lecteur).

L'assistant de création d'agence de la console (`AgencyOnboardingDialog`) proposait un champ
libre « Type », envoyé en `agency.type`. `StoreAgencyOnboardingRequest` l'acceptait (chaîne de
80), et `AgencyProvisioningService` le rangeait dans `agencies.metadata.onboarding_type`, que
rien ne lit, ni à l'API ni au front. L'opérateur qui tapait « individual » obtenait une agence
`standard`.

## Décision du porteur (déléguée)

retirer le champ « Type » de l'assistant de création d'agence (`AgencyOnboardingDialog`, sa clé de libellé si plus rien ne la lit), la règle `agency.type` de `StoreAgencyOnboardingRequest` et l'écriture de `metadata.onboarding_type` dans `AgencyProvisioningService` ; les `metadata` déjà écrites ne sont pas réécrites ; test : `POST /api/admin/agencies` avec `agency.type` → 201, l'agence ne porte pas `onboarding_type`

## Objectif utilisateur

L'opérateur ne remplit plus un champ qui n'a aucun effet sur l'agence créée.

## Delta à produire

- [x] `StoreAgencyOnboardingRequest` : règle `agency.type` retirée (un `agency.type` envoyé est
      ignoré par `validated()`).
- [x] `AgencyProvisioningService::provision()` : plus d'écriture de `metadata.onboarding_type`.
- [x] `AgencyOnboardingDialog` : champ « Type » retiré, et `type` du type
      `AgencyOnboardingPayload`.
- [x] Clé `superAdmin.agencyOnboarding.fields.type` retirée des trois langues (plus aucun
      lecteur).

## Critères d'acceptation

- [x] AC1 — `POST /api/admin/agencies` avec `agency.type = individual` → 201, et l'agence créée
      ne porte pas `onboarding_type` dans `metadata`.
- [x] AC2 — l'étape « agence » de l'assistant n'affiche plus de champ « Type ».

## Hors périmètre

- Les `metadata.onboarding_type` déjà écrites ne sont pas réécrites (décision du porteur).
- Poser le `kind` depuis la console : écarté par `models-spec.md` (§ 2) et `features.md` (§ 2.9).

## Notes d'implémentation

- Ablation API : `app/` rendu à `pre-dev` (règle et écriture remises) → 1 rouge sur 6 dans
  `AgencyOnboardingTest` (`onboarding_type` présent) ; correctif remis → 6/6.
- Ablation front : `AgencyOnboardingDialog.tsx` et `fr.json` rendus à `pre-dev` → 1 rouge sur 2
  (« Type » affiché) ; correctif remis → 2/2.
- Chacune des deux moitiés API suffit seule à faire passer AC1 : sans la règle, `validated()`
  écarte `agency.type` avant le service (déduit de `AgencyOnboardingController::store`, qui passe
  `$request->validated()`, à vérifier par ablation séparée, non jouée). Les deux sont retirées,
  comme la décision le demande.
- Le test front existant tapait l'e-mail de contact dans le 4ᵉ champ texte : il passe au 3ᵉ.
- La clé `wo` est retirée avec les deux autres (parité de `check:i18n`) ; aucun texte wolof
  n'est écrit.
