---
id: TCK-1772
title: "Le calendrier, l'intégration, l'invitation et l'affectation d'un rôle ne disent plus quelles agences, quels profils ni quels rôles existent (P62.07)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md"
tags: [back, authorization, calendar, integrations, invitations, agency-roles, pistes]
---

## Objectif utilisateur

Un compte connecté ne peut plus apprendre, par le calendrier, la création d'une intégration ou
d'une invitation, ni par l'affectation d'un rôle, qu'une agence, un profil ou un rôle d'agence
existent quand il n'y a aucun droit.

## Contexte

Réf : **P62.07** du fichier de pistes (angle 62), `validé` par le porteur (critère V2 accordé).

Mesuré avant correctif (2026-10-23, b5e5b0401), compte sans agence, agence tierce et identifiant
absent `99999999` :

- `GET /api/calendar?agency_id=` : tierce 403 `calendar.other_agency_forbidden`, absente 422 ;
- `POST /api/integrations` et `POST /api/invitations`, corps incomplet : une erreur `agency_id` de
  plus pour l'absente seule ; corps complet d'un admin d'une autre agence (invitation) : 422 pour
  l'absente, 403 pour la tierce ;
- `PATCH /api/profiles/{id}/agency-role` : profil tiers 403, absent 404 ; pour un admin légitime,
  rôle d'une autre agence 422 « This role belongs to another agency », rôle absent 422 « The
  selected agency role id is invalid ».

## Décision du porteur

> (a) comme P62.01 : même traitement, et 404 quand `assign` refuse sur `agency-role` (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « Même traitement que P62.01 » : l'existence ne se juge plus avant l'autorisation, et l'absent
  reçoit la réponse du refus.
- Le super-admin est le seul appelant qui puisse nommer une autre agence que la sienne sur ces
  trois routes ; il garde le 422 d'une agence absente ou supprimée, que fige déjà TCK-1338
  (`AgenceSupprimeeNonCibleeTest`, corps incomplet compris). C'est la voie la plus étroite : rien ne
  change pour lui, et le contrôle d'existence ne court plus pour qui que ce soit d'autre.
- Le rôle absent reçoit la réponse du rôle d'une autre agence (422 sur `agency_role_id`,
  `errors.agency_role.other_agency`), jugée après l'autorisation.

## Contrat de données

Formes inchangées. Hors super-admin, une `agency_id` absente rend la réponse d'une agence tierce
(403 du contrôleur, ou les seules erreurs des autres champs). `PATCH …/agency-role` rend 404 quand
le profil est absent, sans agence, ou qu'`assign` refuse ; un rôle absent rend 422 comme un rôle
d'une autre agence.

## Delta à produire

- [x] `App\Rules\AgenceNommeeParLeSuperAdmin` : juge l'existence (hors supprimées) de l'agence pour
      le seul super-admin.
- [x] `IndexCalendarRequest`, `StoreIntegrationRequest`, `CreateInvitationRequest` : `agency_id`
      passe par cette règle au lieu d'`exists:agencies,id`.
- [x] `AssignAgencyRoleRequest` : `agency_role_id` `['required', 'integer']` ;
      `Profile\AgencyRoleController::update()` : 404 quand le profil manque ou qu'`assign` refuse,
      rôle absent → la réponse du rôle d'une autre agence.
- [x] `ExistsSurRouteOuverteTest` : les quatre dernières exceptions retirées, la liste est vide.
- [x] `AgencyRoleAssignmentTest::test_a_plain_agent_cannot_reassign` attend 404.
- [x] Test : `tests/Feature/Api/AgencyAndRoleExistenceOracleTest.php`.

## Critères d'acceptation

- [x] AC1 — calendrier : agence absente et tierce, même 403 `calendar.other_agency_forbidden` ; le
      super-admin garde son 422 pour l'absente.
- [x] AC2 — intégration et invitation : agence absente et tierce, mêmes statut et corps, corps
      incomplet comme corps complet d'un admin d'une autre agence.
- [x] AC3 — affectation : profil tiers et profil absent, rôle tiers et rôle absent, même 404 pour
      qui ne peut pas affecter ; pour l'admin, rôle absent et rôle d'une autre agence, même 422.

## Hors périmètre

- Les routes `Admin/` (console du super-admin), non mesurées par l'angle 62.

## Notes d'implémentation

- Ablation : les cinq fichiers d'`app/` remis à l'origine → 6 rouges sur 7, et
  `ExistsSurRouteOuverteTest` rouge (exceptions sans la forme) ; règle neutralisée pour le
  super-admin → 1 rouge ici et 2 dans `AgenceSupprimeeNonCibleeTest` ; remis → verts.
- Un `exists:` conditionné au super-admin aurait gardé la forme que lit la garde d'architecture
  (elle lit le texte de `rules()`) : la règle nommée dit l'intention, et la garde se vide.
- 245 verts sur les 29 classes qui frappent les quatre routes.
