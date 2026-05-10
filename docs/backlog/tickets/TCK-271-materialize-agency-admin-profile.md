---
id: TCK-271
title: "Matérialiser le modèle AgencyAdminProfile (résolution divergence TCK-255 / TCK-258)"
status: todo
phase: P1
family: applicatif
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-255]
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#3-profils"
tags: [back, profiles, debt, p1]
---

## Contexte

TCK-255 (Wizard host individual) et la spec models-spec mentionnent un
`AgencyAdminProfile` à créer pendant le wizard, à côté de l'`OwnerProfile`,
pour matérialiser le rôle agency_admin du user dans l'agence.

À l'implémentation de TCK-258 (form invitation Agent), l'équipe a noté
qu'`agency_admin` est en pratique géré uniquement comme un **rôle spatie**
scopé `team_id = agency.id` — il n'existe pas (encore) de table dédiée.

TCK-255 a donc dû arbitrer cette divergence :

- **Décision** : ne PAS créer de modèle `AgencyAdminProfile` dans le
  cadre du wizard host individual (hors périmètre applicatif).
- **Compromis** : attacher le rôle spatie `agency_admin` scopé team_id à
  l'utilisateur (déjà en place dans `HostIndividualOnboardingService`)
  ET créer un `OwnerProfile` actif pour disposer d'un profil concret
  attachable au cookie `active_profile_id`.

Conséquence : le polymorphisme "active profile" du `ResolveActiveProfile`
middleware ne peut pointer que sur l'`OwnerProfile`. La résolution du
team_id pour les permissions agency_admin reste correcte (auto-bascule
sur le profil unique → team_id = agency.id), mais le wording de plusieurs
specs et endpoints reste à clarifier.

## Objectif

Faire converger code et spec :

- soit créer un modèle `AgencyAdminProfile` (table, factory, relations,
  resource, ResolveActiveProfile alias) et l'instancier dans
  `HostIndividualOnboardingService::onboard()` + ailleurs ;
- soit **acter** dans `models-spec.md` que `agency_admin` reste un rôle
  spatie sans profil dédié, et adapter le wording des tickets futurs.

## Delta proposé

Option A — créer le modèle (préférable si on veut un cookie d'active
profile vraiment "agency_admin") :

- [ ] Migration `agency_admin_profiles` (`user_id`, `agency_id`,
      `status`, `metadata`, `timestamps`, `deleted_at`).
- [ ] `App\Models\Profiles\AgencyAdminProfile` + factory + enum
      `AgencyAdminProfileStatus`.
- [ ] Ajouter au `ActiveProfileResolver::TYPE_MAP` ("agency_admin" =>
      AgencyAdminProfile::class).
- [ ] Mettre à jour `HostIndividualOnboardingService` pour créer le
      profil (dans la même transaction) et le retourner comme
      `active_profile`.
- [ ] Mettre à jour `AgencyProvisioningService` pour la même cohérence.
- [ ] Mettre à jour les tests TCK-255 et TCK-263 pour vérifier la
      présence du nouveau profil.

Option B — formaliser l'absence :

- [ ] Mettre à jour `docs/models-spec.md` §3 et `docs/features.md` §1.12
      pour expliciter que "agency_admin" est un rôle spatie sans table
      dédiée.
- [ ] Re-libeller toute mention restante d'`AgencyAdminProfile` dans
      les tickets futurs (TCK-269, etc.).

## Critères d'acceptation

- [ ] Code et spec convergent — plus aucune mention contradictoire de
      `AgencyAdminProfile` selon l'option retenue.
- [ ] Si option A : un user wizard-onboardé via TCK-255 a son cookie
      `active_profile_id` qui pointe sur l'`AgencyAdminProfile` et plus
      sur l'`OwnerProfile`.

## Hors périmètre

- Migration de données pour les agences déjà créées via super-admin
  (TCK-263) — traitable séparément si option A.

## Notes

Ticket créé pendant l'implémentation de TCK-255 par décision
d'isolation : les modifications du modèle profils sortaient du scope
applicatif `wizard host individual`.
