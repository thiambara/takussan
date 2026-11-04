---
id: TCK-665
title: "La liste d'équipe ne livre que les profils et rôles tenus dans l'agence active"
status: done
phase: P0
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#112-agence--équipe
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-3--isolation-entre-agences-et-autorisation
tags: [back, front, security, isolation, pistes]
---

## Contexte

Réf : **P03.02** du fichier de pistes, `validé` par le porteur (critères accordés : V2 et V3).

`GET /api/users` borne sa base aux personnes qui ont un profil dans l'agence active (TCK-147),
mais `include=agentProfiles|ownerProfiles|agencyAdminProfiles` chargeait **tous** les profils de
la personne, et `filter[role]` cherchait un profil dans n'importe quelle agence. L'admin de A
lisait donc, d'une personne bailleur chez lui et agent dans B, son profil d'agent de B entier
(licence, commission, `metadata`), et `filter[role]=agent` lui apprenait qu'elle est agent
ailleurs. `include=platformProfile` disait si une personne est opératrice de la plateforme.

## Décision du porteur

includes et filter[role] bornés à l'agence active ; include=platformProfile refusé hors console

## Objectif

Hors super-admin, `GET /api/users` ne livre et ne filtre que ce que la personne tient dans
l'agence active.

## Delta à produire

- [x] `App\Http\Includes\AgencyScopedRelationship` : include de relation borné à
      `agency_id = <agence>`, qui garde les sparse fieldsets de la relation.
- [x] `User::buildAgencyTeamQuery()` : même liste blanche que `buildQuery()`, sauf les trois
      includes de profils bornés, `platformProfile` absent (400), et `filter[role]` jugé dans
      l'agence.
- [x] `UserAdminController::index` : ce constructeur hors super-admin.
- [x] Front : `fetchAdminUsers` ne demande plus `platformProfile` (la console d'équipe prendrait
      sinon un 400).
- [x] Tests : `UserAdminIncludeScopeTest` (6), `admin-users.test.ts` (assertion resserrée).

## Critères d'acceptation

- [x] AC1 — Admin de A, personne bailleur dans A, agent et admin dans B :
      `include=agentProfiles,ownerProfiles,agencyAdminProfiles` rend `agent_profiles` et
      `agency_admin_profiles` vides, `owner_profiles` sur A seul ; rien de B dans la réponse.
- [x] AC2 — `fields[owner_profiles]=…` continue de restreindre les colonnes du profil inclus.
- [x] AC3 — `filter[role]=agent|agency_admin|owner` ne retient que les profils tenus dans A ;
      `service_provider` exige une collaboration avec A ; `super_admin` ne rend personne.
- [x] AC4 — `include=platformProfile` rend 400 à l'admin d'agence.
- [x] AC5 — Le super-admin garde les includes non bornés sur `/api/users`.

## Hypothèses (mode sans humain)

- « Console » désigne la console super-admin. Sur `/api/users`, le chemin super-admin (sans
  agence active, inter-agences par TCK-147) garde `include=platformProfile` et les includes non
  bornés : il n'y révèle rien qu'il ne voit déjà. Le refus vaut pour l'admin d'agence.
- `filter[role]=service_provider` borné à l'agence = un profil prestataire qui a une
  collaboration (quel que soit son statut) avec l'agence active, le prestataire n'ayant pas
  d'`agency_id`. Statut ignoré, comme l'appartenance de la base (TCK-587).

## Hors périmètre

- `GET /api/agencies/{agency}/members` (`AgencyController::listMembers`) passe aussi par
  `User::buildQuery()` avec les mêmes includes non bornés : même défaut probable, non mesuré ici.
- Le refiltrage côté client de `team-suspension.ts` reste en place (devenu redondant, inoffensif).

## Notes d'implémentation

- Rouge avant correctif : 4 tests sur 6 (profils de B livrés ; `filter[role]=agent` et
  `service_provider` retiennent la personne de B ; `include=platformProfile` rend 200).
- Ablation : contrôleur remis sur `User::buildQuery()` → les mêmes 4 rouges ; ligne `select` de
  `AgencyScopedRelationship` retirée → le test des sparse fieldsets rougit. Remis → 6 verts.
- Piège : `fields[owner_profiles]` sans `user_id` rend une relation vide (l'eager load ne
  s'apparie plus) — comportement préexistant de spatie, le test demande `user_id`.
