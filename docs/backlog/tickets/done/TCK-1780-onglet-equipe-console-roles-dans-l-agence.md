---
id: TCK-1780
title: "L'onglet Équipe d'une agence, dans la console, ne nomme que les rôles tenus dans cette agence"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-176--rôles-lus-toutes-agences-confondues-par-profiletypes"
tags: [api, console, profils, pistes]
---

## Objectif utilisateur

L'opérateur de la console qui ouvre l'onglet Équipe de l'agence A lit, pour chaque membre, les
rôles qu'il tient dans A, et non ceux qu'il tient dans d'autres agences.

## Contexte

Réf : **P176.01** du fichier de pistes, `retenu · autonome` (A1 : TCK-1717 a déjà écrit la règle
pour l'export d'audit, le rôle se juge dans l'agence de la ligne).

Mesuré avant correctif sur `38b8f36a7` : compte agent de A, admin et bailleur de B, super-admin,
`GET /api/admin/agencies/{A}/team` → la ligne porte `["agency_admin","agent","owner","customer"]`.

## Hypothèses (mode sans humain)

- Seuls les trois profils d'agence (`agency_admin`, `agent`, `owner`) se bornent à l'agence lue,
  comme `ActivityLogExporter::roleDansLAgence` (TCK-1717). `super_admin`, `service_provider` et les
  rôles dérivés (`customer`, `tenant`) restent ceux du compte : la piste les met « à part ».
- Le statut des profils n'est pas jugé : c'est P176.03 (V2), au porteur.

## Delta à produire

- [x] `Admin\AgencyDetailController::team()` précharge les trois relations de profil d'agence
  bornées à `agency_id` de la route.
- [x] Garde : `tests/Feature/Api/Admin/AgencyTeamRolesTest.php`.

## Critères d'acceptation

- [x] AC1 — Dans l'équipe de A, le membre agent de A et admin/bailleur de B porte
  `["agent","customer"]`.
- [x] AC2 — Dans l'équipe de B, le même porte `["agency_admin","owner","customer"]`.

## Notes d'implémentation

- Ablation : contrôleur remis à son état antérieur → 1 rouge sur 1 (la ligne de A porte
  `agency_admin`, `owner`) ; rétabli → vert.
