---
id: TCK-1077
title: "L'hôte d'un espace `individual` est présenté propriétaire, et non agent, sur l'annuaire et la fiche d'agence"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-85--ce-que-le-site-public-montre-dune-agence-individual"
tags: [api, public, agence, profils, pistes]
---

## Contexte

Réf : **P85.02** du fichier de pistes, `retenu · autonome` (A1). « Publier » crée un espace
`individual` et donne à l'hôte un `AgencyAdminProfile` actif sur lui
(`HostIndividualOnboardingService::autoOnboard`). `PublicProfileFacts::rolesPublics()` comptait
tout `AgencyAdminProfile` actif, et `professionnelsIci` de `PublicAgencyController::show()`
retenait les admins actifs de l'agence quel que soit son `kind`. L'hôte était donc
`public_role = agent` sur `/api/public/agents`, `/api/public/agents/{slug}` et l'équipe de son
espace (compté dans `stats.agents`), quand la fiche de son bien le disait déjà non-agent.

`features.md` § 1.2 réserve « Agent immobilier » au professionnel en exercice ; § 1.12 fait de
l'agence `individual` l'espace d'un hôte solo.

## Objectif

L'admin d'un espace `individual` n'est jamais compté en agent ; l'admin d'une agence `standard`
l'est toujours.

## Delta à produire

- [x] `PublicProfileFacts::rolesPublics()` : un `AgencyAdminProfile` ne compte que dans une agence
      `standard`.
- [x] `PublicAgencyController::show()` : `professionnelsIci` ne retient les admins que si l'agence
      est `standard`.
- [x] Tests : deux cas neufs dans `tests/Feature/Public/PublicRoleTest.php`.

## Critères d'acceptation

- [x] AC1 : l'hôte d'un espace est `owner` sur `/agents/{slug}`, sur `/agents` et dans l'équipe de
      son espace, et `stats.agents` y vaut 0.
- [x] AC2 : l'admin d'une agence `standard` reste `agent` sur ces trois surfaces.
- [x] AC3 : un hôte qui est agent d'une agence `standard` reste `agent` sur sa fiche, et `owner`
      dans l'équipe de son espace.

## Hypothèses (mode sans humain)

- Le `AgentProfile` ne change pas : une agence `individual` n'en a pas (piste, et
  `features.md` § 1.12).

## Hors périmètre

- L'espace `individual` dans l'annuaire des agences (P85.04, au porteur) et son nom (P85.03).
- Les rendus du front (titre, JSON-LD, `TeamStrip`), qui lisent `public_role` sans changement.

## Notes d'implémentation

- Avant correctif : AC1 rouge dès `/agents/awa-hote` (`agent`).
- Ablations, chacune seule : `rolesPublics()` d'origine → AC1 rouge ; contrôleur d'origine → AC3
  rouge. Sans AC3, le changement du contrôleur n'aurait été gardé par rien : pour l'hôte seul, la
  conjonction avec `rolesPublics()` le rend déjà `owner`.
