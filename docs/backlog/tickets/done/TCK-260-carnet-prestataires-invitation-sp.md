---
id: TCK-260
title: "Carnet de prestataires + invitation Service Provider"
status: done
phase: P1
family: applicatif
estimate: S
wave: 29
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-249]
blocks: [TCK-261, TCK-262]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#37-serviceproviderprofile-"
    - "docs/models-spec.md#39-serviceprovideragencycollaboration-"
tags: [back, front, onboarding, service-provider, maintenance, p1]
---

## Objectif utilisateur

Une agence (standard ou individual) doit pouvoir tenir un **carnet de prestataires** (plombiers, électriciens, etc.) et **inviter** un nouveau prestataire — soit lors de la création d'une demande de maintenance, soit en pré-référencement depuis une page dédiée.

## Contrat de données

Repose sur le pattern Invitation unifié (TCK-249) :

- `POST /api/invitations` avec body :

  ```json
  {
    "email": "plombier@example.com",
    "role": "service_provider",
    "agency_id": 42,
    "invitable_type": "ServiceProviderProfile",
    "invitable_data": { "first_name": "...", "last_name": "...", "phone": "...", "trades": ["plumbing"], "intervention_zones": [...] },
    "metadata": { "from_maintenance_request_id": 123 }
  }
  ```

  Si l'invitation est déclenchée depuis une demande de maintenance, le `from_maintenance_request_id` est porté dans `metadata` pour que le SP atterrisse directement sur la demande après acceptation (TCK-261).

Endpoints carnet :

- `GET /api/agencies/{agency}/service-providers` — liste des SP rattachés (via `ServiceProviderAgencyCollaboration`).
- `POST /api/agencies/{agency}/service-providers/invite` — wrapper du pattern Invitation pour SP (simplifie le payload côté frontend).

## Direction UX / Artistique

Page `/app/maintenance/providers` (carnet) :
- Liste des SP avec métiers, zones, tarifs indicatifs, statut (Actif / Invité)
- Bouton "Ajouter un prestataire" → modal d'invitation

Lors de la création d'une demande de maintenance : champ "Prestataire" → option "Inviter un nouveau prestataire" → même modal pré-rempli avec les métiers/zones de la demande.

## Contraintes strictes (métier)

- Accessible aux agences `standard` ET `individual` (un host individual a aussi besoin de ses prestataires).
- Permission requise : `invite_service_provider` (par défaut `agency_admin`, `agent` si délégué).
- Conflit email : si un SP existe déjà avec ce profil dans cette agence → 409. Si le SP existe dans **une autre agence**, l'acceptation propose le multi-rattachement (TCK-262).
- Activity log : `service_provider_invited`.

## Delta à produire

- [ ] Endpoints backend
- [ ] Service : `App\Services\Invitation\ServiceProviderInvitationService` (wraps `InvitationService` + crée `ServiceProviderProfile` draft + `ServiceProviderAgencyCollaboration` draft)
- [ ] Policy : `ServiceProviderProfilePolicy@invite` (kind=standard OR individual + permission)
- [ ] Tests backend : invitation, conflit, multi-rattachement détecté (delegate à TCK-262 pour le flow complet)
- [ ] Page frontend `/app/maintenance/providers`
- [ ] Composant `<InviteServiceProviderModal>` (réutilisable depuis création demande maintenance)
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Une agence standard ou individual peut envoyer une invitation SP.
- [ ] AC2 — Carnet liste les SP rattachés à l'agence avec leur statut.
- [ ] AC3 — Depuis une demande de maintenance, l'invitation pré-remplit les métiers et zones.
- [ ] AC4 — Conflit dans la même agence → 409.
- [ ] AC5 — Si SP existant dans autre agence → l'invitation est créée et le flag `existing_sp_other_agency` remonté côté frontend (pour TCK-262).

## Hors périmètre

- Wizard onboarding SP post-acceptation (KYC, dispos) — TCK-261.
- Multi-rattachement complet d'un SP à plusieurs agences — TCK-262.

## Notes d'implémentation

### Décisions clés

- **Collaboration en `paused` au pre-create** — la table `service_provider_agency_collaborations` n'a que l'enum `CollaborationStatus` existant (Active/Paused/Ended) ; on n'a pas créé un nouvel enum dédié au draft (le ticket le permettait). On utilise `Paused` comme état pré-acceptation. Le wizard post-acceptation (TCK-261) fera le flip vers `Active`.
- **Ajout de `status` sur `service_provider_profiles`** — la migration TCK-260 ajoute une colonne `status` (mirror Owner/Agent) + l'enum `ServiceProviderProfileStatus` (`draft|active|inactive|suspended`). Permet à `InvitationService::finalizeAccept()` de basculer le profil à `active` à l'acceptation via le hook générique `array_key_exists('status', …)`.
- **`unique(user_id)` levé** — la migration drop la contrainte historique pour autoriser :
  1. les drafts coexistants (`user_id = NULL`) ;
  2. la voie alternative pour TCK-262 (multi-rattachement) si on choisit, à terme, de matérialiser un profil par agence plutôt qu'un profil unique multi-collab. L'unicité réelle est portée par `service_provider_agency_collaborations(profile, agency)`. Le test `ProfileSchemaTest::test_service_provider_profile_unique_user` a été refactoré en `…_allows_multiple_rows_for_same_user`.
- **Détection multi-agence non-bloquante** — le service expose `existing_sp_other_agency: bool` dans la `meta` de la réponse + dans `invitation.metadata`. Pas de blocage : c'est TCK-262 qui transformera ce flag en flow d'acceptation "rejoindre / créer un profil dédié".
- **Conflict `existing_sp_same_agency`** — la garde du service vérifie qu'un SP **actif** (User attaché + collaboration Active) n'existe pas déjà ; un draft pré-existant ne bloque pas (on suit le pattern Owner — l'inviter passe par le resend générique).
- **Permission `invite_service_provider`** — ajoutée au `RolesAndPermissionsSeeder`, default-granted à `agency_admin`. Déléguable à un agent via `RoleDelegation` (TCK-108). Distincte de `invite_owner` et `manage_team` parce que la portée est différente (carnet ≠ équipe ≠ portfolio propriétaires) et parce que le ticket exige une typologie d'agence distincte (standard ET individual).
- **Policy dans `App\Policies\Profiles\`** — pour ne pas surcharger `App\Policies` avec une SP-Profile-Policy qui matche un namespace de profil. Bind explicite dans `AppServiceProvider::boot()` (l'auto-discovery de Laravel ne probe pas `App\Models\Profiles\X` → `App\Policies\Profiles\XPolicy`).
- **Listing per-agency** — `GET /api/agencies/{agency}/service-providers` filtre via `whereHas('agencyCollaborations', ...)` plutôt que via une jointure, pour rester compatible avec les sparse fieldsets spatie/laravel-query-builder.
- **`from_maintenance_request_id` propagé** — sur le service ET dans la metadata de l'invitation. Le wizard SP (TCK-261) le lira pour rediriger directement sur la demande.

### Fichiers touchés

**Backend (neuf)**

- `app/Models/Enums/ServiceProviderProfileStatus.php`
- `app/Services/Invitation/ServiceProviderInvitationService.php`
- `app/Http/Controllers/Api/Agency/ServiceProviderInvitationController.php`
- `app/Http/Controllers/Api/ServiceProviderProfileController.php`
- `app/Http/Requests/Invitation/InviteServiceProviderRequest.php`
- `app/Policies/Profiles/ServiceProviderProfilePolicy.php`
- `database/migrations/2026_05_10_170000_make_user_id_nullable_and_add_status_on_service_provider_profiles.php`
- `lang/{fr,en,wo}/service_providers.php`
- `tests/Feature/Invitation/InviteServiceProviderTest.php` (12 tests)

**Backend (modifié)**

- `app/Models/Profiles/ServiceProviderProfile.php` — `$fillable`, `$casts`, hooks HasQueryBuilder, scope `active`, accessors `display_name` / `draft_email`, relation polymorphique `invitations()`.
- `app/Providers/AppServiceProvider.php` — bind `Gate::policy(ServiceProviderProfile::class, ServiceProviderProfilePolicy::class)`.
- `database/seeders/System/RolesAndPermissionsSeeder.php` — permission `invite_service_provider` + assignation à `agency_admin`.
- `database/factories/Profiles/ServiceProviderProfileFactory.php` — défaut `status` + state `draft()`.
- `routes/api/agencies.php` — routes `serviceProviders.{index,invite}`.
- `tests/Feature/Database/ProfileSchemaTest.php` — test renommé pour le drop de l'unique.

**Frontend (neuf)**

- `src/lib/queries/service-providers.ts`
- `src/components/service-providers/InviteServiceProviderSheet.tsx`
- `src/components/service-providers/ServiceProvidersList.tsx`
- `src/app/(dashboard)/app/maintenance/providers/page.tsx`

**Frontend (modifié)**

- `src/components/layout/AppSidebar.tsx` — entrée "Carnet prestataires".
- `src/components/maintenance/MaintenanceForm.tsx` — TODO en tête pour TCK-261.
- `src/messages/{fr,en,wo}.json` — namespace `serviceProviders.*`.

### Hors périmètre (laissé à TCK-261 / TCK-262)

- Wizard post-acceptation (KYC + dispos + flip de la collaboration `Paused` → `Active`).
- Modal "rejoindre une autre agence" qui consomme `existing_sp_other_agency`.
- Bouton "Inviter un nouveau prestataire" depuis le formulaire de demande de maintenance — TODO posé en tête de `MaintenanceForm.tsx` avec les 3 props à câbler (`prefilledTrades`, `prefilledZones`, `fromMaintenanceRequestId`).
