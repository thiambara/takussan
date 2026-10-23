---
id: TCK-1808
title: "Le nom d'un rôle système se lit dans la langue du lecteur, à l'avis comme à la console"
status: todo
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: [TCK-1806]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-164--paramètres-text-des-notifications-codées-qui-portent-un-code"
tags: [back, front, notifications, roles, i18n, pistes]
---

## Contexte

Réf : **P164.04** du fichier de pistes, `validé` (validation en bloc du porteur, critère V7 accordé).

Les rôles système sont rangés avec un nom français (`AgencyRoleBaseType::defaultRoleName()` :
« Agent », « Administrateur », « Propriétaire », « Prestataire »).
`governance.role_capabilities_changed` range ce nom en paramètre `text` : un lecteur anglais lit
« The permissions of the role Administrateur were changed… ». La console des rôles affiche le
même nom brut, quelle que soit la langue.

## Décision du porteur

validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué retenue (première option de la `Piste`) : `role_capabilities_changed`
déclare `role` en `PARAM_ROLE` et range `base_profile_type` pour un rôle système, `name` pour un
rôle créé (le repli de `role()` le rend tel quel) ; la console traduit au front, pour les seuls
rôles système, par les clés de rôle existantes ; la ressource ne traduit rien ; renommer les rôles
système est écarté.

## Contrat de données

- API : `NotificationCode::GovernanceRoleCapabilitiesChanged` → `role` en `PARAM_ROLE`.
  `GovernanceAlertService::paramsFor` range `base_profile_type` si `is_system`, `name` sinon, `''`
  pour un rôle disparu (variante `_unnamed` inchangée). Rendu API : `invitations.roles.<code>`.
- Cloche : la nature `role` arrive par `param_types` (TCK-1806) : `profile.roles.<code>`.
- Console (`src/components/admin/roles/`) : le nom d'un rôle système se lit sous
  `profile.roles.<base_profile_type>` (« Admin agence », « Agent immobilier »…), un rôle créé garde
  son `name`. `AgencyRoleResource` ne change pas.

## Choix de l'implémenteur (voies laissées ouvertes)

- **Où la console traduit** : partout où un nom de rôle s'affiche sous `admin/roles/` — liste,
  sélecteur de rôle d'un membre, liste des modèles à cloner, nom prérempli d'un clone, champ (en
  lecture seule) de l'éditeur pour un rôle système. Le dialogue de suppression ne voit jamais de
  rôle système. Une seule fonction, `nomDuRole`.
- **Lignes déjà écrites** : elles gardent le nom français rangé, rendu tel quel par le repli de
  `role()` ; aucune réécriture de données.
- Hypothèse : un rôle créé dont le nom vaut un code de rôle (« agent ») serait rendu par le
  libellé de ce code à l'avis ; le texte rendu reste le même mot, l'écart est accepté.

## Delta à produire

- [ ] `NotificationCode::params()` et `GovernanceAlertService::paramsFor`.
- [ ] `nomDuRole` et ses appelants de la console.
- [ ] Tests : API (`RoleSystemeNommeDansLaLangueTest`), front (`AgencyRolesList.test.tsx`,
  `NotificationRow.test.tsx` déjà couvert par TCK-1806).

## Critères d'acceptation

- [ ] AC1 — l'avis pour un rôle système `agency_admin`, rendu en `en`, ne contient pas
  « Administrateur » ; en `fr`, il nomme « administrateur d'agence ».
- [ ] AC2 — pour un rôle créé, l'avis porte son nom tel quel.
- [ ] AC3 — la console affiche « Agency admin » en `en` pour le rôle système, et le nom d'un rôle
  créé tel quel.

## Hors périmètre

- Renommer les rôles système, réécrire les lignes d'avis existantes.

## Notes d'implémentation
