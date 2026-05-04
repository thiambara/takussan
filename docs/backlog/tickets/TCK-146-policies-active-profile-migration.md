---
id: TCK-146
title: Policies & domaines résiduels — migration vers profils actifs (post-TCK-142)
status: done
phase: P2
family: back
estimate: M
created: 2026-05-03
updated: 2026-05-03
depends_on: [TCK-142]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, refactor, policies, profiles, cleanup, security]
---

## Contexte

TCK-142 a livré le drop des colonnes `users.type` / `users.agency_id` avec un accesseur transitionnel `User::getAgencyIdAttribute()` qui résout depuis le profil actif (HTTP) ou le premier profil agency-scoped (jobs/CLI). La PR de hardening post-merge a migré les **controllers et services** majeurs (`AgencyController`, `AgencyMemberRoleController`, `AgencyStatsController`, `BookingController`, `PropertyModerationController`, `UserRoleController`, `AuditLogController`, `ActivityLogExporter`, `DashboardController`, `DashboardAgencyController`) vers `User::isSuperAdmin()` (probe team_id=null) et vers `isAgentAt($agencyId) || isOwnerAt($agencyId)` pour l'authz d'appartenance.

Restent **les Policies** et quelques sites mineurs qui lisent encore `$user->agency_id` ou `hasRole(['admin', 'super_admin'])` directement. Ils sont *correct under active-profile context* mais fragiles :

1. Pour un user multi-profile sans `X-Profile-Id` ni cookie ni auto-bascule, l'accesseur retombe sur le **premier profil** trouvé — sémantique implicite, surprenante.
2. Pour `hasRole('super_admin')` au team_id courant : un super_admin agissant sous `X-Profile-Id` (team_id pinné sur l'agence) **perd** son rôle global (la role assignment est sous `team_id = null`). Le helper `isSuperAdmin()` corrige ça en restaurant la sémantique team-null.

L'objectif est de fermer la dette transitionnelle pour que le codebase parle exclusivement le langage des profils, et que `$user->agency_id` puisse être supprimé du modèle (l'accesseur, pas la colonne — déjà disparue).

## Objectif

Migrer toutes les Policies et sites résiduels vers les helpers profils (`isSuperAdmin`, `isAgentAt`, `isOwnerAt`, `isProfessional`, `request()->activeProfile()`), supprimer le besoin de l'accesseur `User::getAgencyIdAttribute()` (et son mutator), avec zéro régression fonctionnelle.

## Delta à produire

- [ ] Policies — migrer chaque comparaison `$user->agency_id === $resource->agency_id` vers `$user->isAgentAt($resource->agency_id) || $user->isOwnerAt($resource->agency_id)`, et chaque `$user->hasRole('super_admin')` (probe team courant) vers `$user->isSuperAdmin()` :
    - `app/Policies/PropertyPolicy.php:33`
    - `app/Policies/LeasePolicy.php:40,64,96,129,152` (5 sites)
    - `app/Policies/MediaPolicy.php:38,52-53,101-102` (admin gates + agency-id checks, 2 occurrences imbriquées)
    - `app/Policies/BankStatementPolicy.php:13-14`
    - `app/Policies/RoleDelegationPolicy.php:17,~`  (vérifier toutes les occurrences `agency_id`)
    - `app/Policies/ConversationPolicy.php` — auditer les check d'appartenance d'agence
- [ ] Sites résiduels backend (à vérifier au grep `\$user->agency_id` après les Policies) :
    - `app/Http/Controllers/Api/Admin/PropertyModerationController.php` — la ligne `?? $user->agency_id` (fallback) peut sauter si l'active profile est obligatoire pour les agency_admins ; sinon laisser
    - Tous les jobs / commands / listeners qui lisent `$user->agency_id` hors request scope → décision : exposer un helper dédié `User::firstAgencyScopedProfile(): ?Profile` pour rendre l'intent explicite
- [ ] Mises à jour des **compound role checks** `hasRole(['admin', 'super_admin'])` / `hasRole(['agency_admin', 'super_admin'])` :
    - Décomposer en `isSuperAdmin() || hasRole('admin')` quand `'admin'` est censé être *global* (probe team-null nécessaire)
    - Garder `hasRole(['admin', 'agency_admin'])` (sans `super_admin`) tel quel quand l'intent est *agency-scoped* — le team_id contextualisé via `ResolveActiveProfile` couvre déjà ce cas
    - Auditer chaque site : la sémantique de `'admin'` n'est pas uniforme dans le codebase (test `AgencyAgentTest::createAdminWithAgency()` crée un admin agency-scoped)
- [ ] Suppression de l'accesseur transitionnel `User::getAgencyIdAttribute()` une fois tous les call-sites migrés :
    - Retirer la méthode + son docblock TCK-142
    - Retirer `'agency_id'` de `$fillable` (le mutator `setAgencyIdAttribute` peut rester un no-op pour la backward-compat tests, ou être supprimé si tous les tests sont migrés)
    - Vérifier qu'aucune sérialisation (UserResource, AuthMeResource, etc.) ne s'appuie dessus — exposer `agency_id` au front via l'active profile : `$user->activeProfile()?->agency_id`
- [ ] Tests :
    - Aucun test ne référence `$user->agency_id` (lecture) ; les écritures legacy (`User::factory()->create(['agency_id' => $a->id])`) passent par les states `withOwnerProfile($a)` / `withAgentProfile($a)`
    - `Tests\Feature\NoLegacyUserAgencyAccessorTest` (nouveau) — grep statique `->agency_id` dans `app/Policies/` + `app/Http/Controllers/` renvoie 0 hit (ou seulement les rares accès légitimes sur `Booking`/`Lease`/`Property`/etc., pas sur `User`)
    - Test ciblé multi-agence : un user avec profils sur agence A et B, sans active profile, ne doit pas voir l'agence A "leak" comme agency par défaut dans une Policy
- [ ] `./vendor/bin/pint` clean
- [ ] Audit séparé (à scoper en sous-ticket si volumineux) : tous les call-sites `activity()->withProperties([...])` pour valider qu'aucun ne loggue de donnée sensible. Le redactor du `CrossTenantAuditController` est un filet — l'origine du leak doit être tracée.

## Critères d'acceptation

- [ ] `grep -rn '\->agency_id' app/Policies app/Http/Controllers` ne retourne plus aucune occurrence sur `User` (les accès `Booking`/`Property`/etc. sur leur propre `agency_id` restent légitimes)
- [ ] `grep -rn "hasRole.'super_admin'" app/Policies app/Http/Controllers` ne retourne plus de bare `hasRole('super_admin')` — toutes remplacées par `isSuperAdmin()`
- [ ] La méthode `User::getAgencyIdAttribute` est supprimée du modèle (ou clairement dépréciée avec `@deprecated` et zéro lecture interne)
- [ ] Aucun test ne lit `$user->agency_id` (sauf via UserResource si exposition API conservée, à arbitrer)
- [ ] Pour un user multi-profile sans active profile résolu, les Policies retournent `false` plutôt que de répondre comme s'il agissait dans son premier profil — testé explicitement dans `MultiProfileWithoutActiveContextPolicyTest` (nouveau)
- [ ] `php artisan test` est entièrement vert
- [ ] Le contrat API frontend reste stable : `UserResource` continue d'exposer un `agency_id` (calculé depuis l'active profile) ou bien le ticket déclare explicitement le breaking change sur ce champ et coordonne avec le frontend

## Hors périmètre

- Frontend (TCK-143 a déjà migré le `ProfileSwitcher` et le contexte multi-profil ; aucune action requise sauf si on rompt le champ `user.agency_id` côté API — auquel cas créer un ticket frontend dédié)
- Audit complet des `activity()->withProperties([...])` writers (à scoper en TCK séparé si nécessaire — voir checklist de Delta)
- Modification de la sémantique de `'admin'` (rôle global vs agency-scoped) — on documente ce qui existe, on ne refactore pas
- Suppression de la colonne `users.agency_id` (déjà drop par TCK-142 — ce ticket porte sur l'**accesseur PHP** seulement)

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder.)_
