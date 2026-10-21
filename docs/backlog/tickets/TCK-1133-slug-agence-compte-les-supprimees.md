---
id: TCK-1133
title: "Le slug engendré d'une agence compte les agences supprimées"
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
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#2-agency"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-92--contraintes-unique-sans-garde--doublon-rendu-en-500"
tags: [back, agence, onboarding, pistes]
---

## Contexte

Réf : **P92.08** du fichier de pistes, `retenu · autonome` (A1 : la contrainte `agencies.slug`
et la règle `unique:agencies,slug` de `StoreAgencyOnboardingRequest` comptent déjà les agences
supprimées).

`AgencyProvisioningService::uniqueSlug` et `HostIndividualOnboardingService::uniqueSlug`
cherchent un slug libre par `Agency::query()`, que la portée `SoftDeletes` borne aux agences
vivantes. Un nom dont le slug appartient à une agence supprimée rend 500
(`agencies_slug_unique`).

## Objectif utilisateur

Le super-admin qui provisionne une agence, et l'hôte qui crée son espace, aboutissent même quand
le nom choisi a déjà servi à une agence supprimée : le slug prend le suffixe libre suivant.

## Delta à produire

- [x] `Agency::withTrashed()` dans les deux `uniqueSlug`.
- [x] Test `tests/Feature/Agency/GeneratedAgencySlugCountsDeletedAgenciesTest.php`.

## Critères d'acceptation

- [x] AC1 — agence « Sunu Gestion » supprimée, `POST /api/admin/agencies` sans `slug` → 201,
      slug `sunu-gestion-2`.
- [x] AC2 — agence « Espace de Amine » supprimée, `POST /api/host/individual/onboard` → 201,
      slug `espace-de-amine-2`.

## Hors périmètre

- Les contrôles d'avant invitation qui ignorent les profils supprimés : leur issue (restaurer ou
  non le profil) est P92.02, classée V2.
- Un filet général des violations d'unicité en 409 (P92.09, à valider).

## Notes d'implémentation

- Avant correctif, les deux cas rendent 500 sur `agencies_slug_unique` (relu sous
  `withoutExceptionHandling()`, le temps de la mesure).
- Ablation : les deux services rendus à `3c6c8301f` → 2 rouges sur 2 ; correctif remis → 2/2.
