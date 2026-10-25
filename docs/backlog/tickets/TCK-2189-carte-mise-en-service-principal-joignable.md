---
id: TCK-2189
title: "La carte de mise en service ne compte l'administrateur principal que joignable"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-225--ce-que-lagence-attache-à-son-administrateur-principal-quand-ce-compte-part"
tags: [api, agence, mise-en-service, pistes]
---

## Objectif

`AgencySetupStatus::adminIds()` n'ajoute `primary_admin_id` aux profils `AgencyAdminProfile`
actifs que si son compte est joignable ; `admin_two_factor` et `first_member` le suivent.

## Contexte

Réf : **P225.03** du fichier de pistes, `validé (délégué)` (V7 accordé).

Effacé, l'administrateur principal restait compté par son identifiant, mais `User::query()` ne le
relisait plus : `admin_two_factor` repassait à faux sans geste possible. Bloqué, il comptait
comme administrateur et comme membre.

## Décision du porteur (déléguée)

validé (délégué) — dans `AgencySetupStatus::adminIds()`, n'ajouter `primary_admin_id` aux profils `AgencyAdminProfile` actifs que si son compte est joignable (`PrimaryPropertyContact::joignable`) ; `admin_two_factor` et `first_member` le suivent ; test : administrateur principal effacé, co-administrateur à 2FA → `admin_two_factor` vrai ; administrateur principal bloqué sans 2FA → il ne compte plus

## Hypothèses (mode sans humain)

- Un administrateur principal bloqué qui garde un profil `AgencyAdminProfile` actif reste compté
  par ce profil : la décision ne touche que l'ajout de `primary_admin_id`.

## Delta à produire

- [x] `adminIds()` : `->when(PrimaryPropertyContact::joignable($agency->primaryAdmin), …)`.
- [x] `AgencySetupStatusTest` : principal effacé, principal bloqué, témoin joignable.

## Critères d'acceptation

- [x] AC1 — principal effacé, co-administrateur à 2FA → `admin_two_factor` vrai.
- [x] AC2 — principal bloqué sans 2FA → `admin_two_factor` vrai, `first_member` faux.
- [x] AC3 — principal joignable sans 2FA → `admin_two_factor` faux, `first_member` vrai (TCK-589).

## Notes d'implémentation

- Avant correctif : AC1 et AC2 rouges.
- Ablation : la condition remise à `primary_admin_id !== null` → 2 rouges ; remise → 18 verts.
