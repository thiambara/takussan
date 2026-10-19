---
id: TCK-990
title: "Après le passage en agence professionnelle, « Publier » et l'assistant hôte ne recréent pas d'espace individuel"
status: doing
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#49-agencyupgraderequest-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-49--passage-dune-agence-individual-à-standard"
tags: [api, onboarding, agency-upgrade, pistes]
---

## Contexte

Réf : **P49.03** du fichier de pistes, `validé` par le porteur. L'invariant « une agence
personnelle par compte » se juge sur le `kind` : `autoOnboard` cherche une agence dont le compte
est `primary_admin_id` **et** `kind = individual`, `onboard` un `OwnerProfile` dans une agence
`individual`. Après la bascule `individual → standard`, aucun des deux ne trouve plus rien, et
`POST /api/host/individual/auto-onboard` crée un second espace (`201`, `created: true`).

## Décision du porteur

> validé — pas de second espace : l'invariant se juge sur une agence dont le compte est `primary_admin_id`, quel que soit son `kind` ; `autoOnboard` rend l'agence existante (`created: false`) et `/onboarding/host` refuse comme pour un hôte déjà installé ; un test « bascule puis auto-onboard » (porteur, 2026-10-19, sur la recommandation du délégué)

## Objectif

Un compte `primary_admin_id` d'une agence, de quelque `kind` qu'elle soit, ne se voit jamais créer
un espace individuel de plus.

## Delta à produire

- [x] `HostIndividualOnboardingService::autoOnboard` : l'agence existante se cherche par
      `primary_admin_id` seul.
- [x] `HostIndividualOnboardingService::onboard` : refus `409` (`agency`) aussi quand le compte est
      `primary_admin_id` d'une agence.
- [x] Tests : `HostAutoOnboardTest` (bascule puis auto-onboard), `HostIndividualOnboardingTest`
      (bascule puis assistant).

## Critères d'acceptation

- [x] AC1 — Auto-onboard, bascule par `AgencyKindFlipService::flip`, puis auto-onboard → `200`,
      `created: false`, la même agence (`kind = standard`), une seule agence en base.
- [x] AC2 — Assistant terminé, bascule, puis `POST /api/host/individual/onboard` → `409`
      (`agency`), une seule agence en base.
- [x] AC3 — Les tests existants tiennent : un bailleur dans l'espace d'un autre n'en devient pas
      administrateur (`test_n_adopte_pas_l_espace_d_un_autre`).

## Hypothèses (mode sans humain)

- Le refus de l'assistant garde sa règle d'avant (un `OwnerProfile` dans une agence `individual`)
  **et** y ajoute `primary_admin_id` : retirer la première changerait le sort d'un bailleur invité
  dans l'espace d'un autre, ce que la décision ne vise pas.
- Pour l'agence existante, `autoOnboard` garde son comportement : il s'assure des deux profils du
  compte (`firstOrCreate`). Après une bascule, ils existent déjà. Un administrateur principal ne
  peut pas être suspendu (`team.suspension_primary_admin`) : la remise à `active` ne lève aucune
  sanction.

## Hors périmètre

- La garde de `/onboarding/host` côté front (non lue par le mesureur) : le refus est porté par
  l'API.

## Notes d'implémentation
