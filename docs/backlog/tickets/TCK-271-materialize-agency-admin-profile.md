---
id: TCK-271
title: "Matérialiser le modèle AgencyAdminProfile (résolution divergence TCK-255 / TCK-258)"
status: done
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

## Notes d'implémentation (2026-05-10)

Option **A** retenue. Le modèle `AgencyAdminProfile` est désormais
matérialisé et pinné comme `active_profile` à la sortie du wizard
host individual.

Décisions prises :

- **Schéma volontairement lean** — la table ne porte que `user_id`,
  `agency_id`, `status` (enum `AgencyAdminProfileStatus :
  active|suspended|archived`), `metadata` (JSON), timestamps + softDeletes.
  Aucune donnée KYC ou financière ; ces colonnes restent sur `OwnerProfile`
  (cas wizard) ou `AgentProfile` (autres rattachements).
- **`user_id` nullable** — parité avec `OwnerProfile` / `AgentProfile`
  post-TCK-256/258 pour éviter une migration de suivi le jour où l'on
  ouvrira un flow "inviter un co-admin d'agence" en `draft`. La contrainte
  `unique(user_id, agency_id)` reste valide (PostgreSQL/MySQL acceptent
  plusieurs NULL dans un index unique multi-colonnes).
- **Cookie `active_profile_id`** — pointe désormais sur
  `agency_admin:<id>` (ex-cible `OwnerProfile`). Le format composite
  `<type>:<id>` géré par `ActiveProfileResolver` reste inchangé : pas de
  cookie `active_profile_type` séparé à introduire, le type est encodé
  dans la valeur du cookie unique.
- **Owner profile conservé** — l'`OwnerProfile` est toujours créé dans
  la transaction du wizard, parce qu'il porte les champs KYC propriétaire
  (rib, tax_id, monthly_income…) et que le rôle spatie `owner` du user
  reste attaché. Les deux profils coexistent ; seul le profil actif a
  changé.
- **`HasProfiles` étendu** — ajout de la relation `agencyAdminProfiles()`,
  inclusion dans la collection unifiée `profiles()`, et dans le `match`
  de `hasProfile()`. Sans cela, `getAgencyIdAttribute` aurait silently
  ignoré les users dont l'unique profil est un `AgencyAdminProfile`.
- **`MeProfilesController` + `ProfileResource`** — alignés pour
  loader/serializer le nouveau type (eager-load `agencyAdminProfiles.agency`,
  exposer le `status` dans le resource match, faire `loadMissing('agency')`
  dans `updateActive`).
- **TCK-263 (super-admin bootstrap)** — vérifié : `SuperAdminBootstrapService`
  ne crée toujours aucun profile (super_admin = rôle global, pas de
  team_id). Aucune régression : `CreateSuperAdminTest` passe (9/9).

Pas de spec drift constaté ; `docs/models-spec.md §3` accepte déjà la
notion de profil par rôle, le nouveau modèle s'inscrit dans cette grille.

Fichiers touchés :

- `takussan-api/database/migrations/2026_05_10_170000_create_agency_admin_profiles_table.php` (new)
- `takussan-api/app/Models/Enums/AgencyAdminProfileStatus.php` (new)
- `takussan-api/app/Models/Profiles/AgencyAdminProfile.php` (new)
- `takussan-api/database/factories/Profiles/AgencyAdminProfileFactory.php` (new)
- `takussan-api/app/Services/Profiles/ActiveProfileResolver.php` (TYPE_MAP)
- `takussan-api/app/Models/Concerns/HasProfiles.php` (relation + collection + hasProfile)
- `takussan-api/app/Http/Resources/Api/Me/ProfileResource.php` (status match)
- `takussan-api/app/Http/Controllers/Api/Me/MeProfilesController.php` (loads + updateActive)
- `takussan-api/app/Services/Onboarding/HostIndividualOnboardingService.php` (createAgencyAdminProfile + active_profile)
- `takussan-api/app/Http/Controllers/HostOnboardingController.php` (response shape)
- `takussan-api/tests/Feature/Onboarding/HostIndividualOnboardingTest.php` (assertions étendues)

Tests : `php artisan test --filter='Onboarding|Profile|ResolveActiveProfile|MeProfiles|Console'`
→ 85+ assertions vertes, dont 11/11 sur le wizard host individual et
9/9 sur la commande `takussan:create-super-admin`. Pint passe (3
fichiers reformatés automatiquement).
