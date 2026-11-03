---
id: TCK-2198
title: "État des lieux : le conducteur ne le lit, ne le liste et ne le modifie que s'il est encore membre de l'agence"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: [TCK-2196]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#48-invitation-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-218--ce-que-le-retrait-éteint-et-que-la-suspension-laisse--délégations-de-rôle-et-colonnes-dauteur"
tags: [api, autorisation, inventories, pistes]
---

## Objectif

La branche du conducteur (`conducted_by`) d'un état des lieux suit la règle d'auteur de TCK-2196 :
`update` exige en plus l'appartenance ; `view` et la liste gardent le bailleur de tout statut.

## Contexte

Réf : **P218.04** du fichier de pistes, `validé`.

### Décision du porteur

> validé — validation du porteur (2026-10-24) : `landlordWrites` gardé, l'appartenance ajoutée : `update` exige en plus une agence nulle ou `isMemberAt` ; `view` et la liste : auteur et (agence nulle, `isMemberAt` ou profil propriétaire de tout statut) ; même règle d'auteur que P218.03

- `view` admettait `conducted_by` seul ; `update` passait par `landlordWrites`, qui ne refuse que le
  bailleur bloqué : le conducteur suspendu ou retiré lisait, listait et modifiait l'état des lieux.

## Hypothèses (mode sans humain)

- L'agence est celle du bien (`property.agency_id`), comme le reste de `InventoryPolicy`.
- « Profil propriétaire de tout statut » : un `OwnerProfile` non supprimé dans cette agence
  (`ownerProfiles()`, `draft`, `active`, `inactive`, `blocked`) ; un profil retiré (supprimé en
  douceur) n'en est plus un.

## Delta à produire

- [x] `InventoryPolicy::view` et `update` ; liste de `InventoryController::index`.
- [x] `ConducteurEncoreMembreTest` ; `MigratedAuthorizationRulesTest` : le conducteur de son cas devient
  bailleur actif de l'agence (même piège que TCK-2196).

## Critères d'acceptation

- [x] AC1 — Conducteur suspendu, puis retiré : `GET` → 403, absent de la liste, `update` faux.
- [x] AC2 — Témoins : conducteur actif (tout) ; bailleur bloqué conducteur (lit et liste, ne modifie
  pas) ; bien sans agence (tout).

## Hors périmètre

- `DocumentPolicy::reaches`, dont la branche `conducted_by` reste à P218.06.

## Notes d'implémentation

- Avant correctif : 200 et listé pour le conducteur suspendu et pour le conducteur retiré.
- Ablation (policy et liste remises) → 2 rouges sur 5 ; remise → 5 verts.
