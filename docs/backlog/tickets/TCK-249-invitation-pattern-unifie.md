---
id: TCK-249
title: "Pattern d'invitation unifié — modèle Invitation + service + emails"
status: done
phase: P0
family: back
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: [TCK-256, TCK-258, TCK-260, TCK-264]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#1-user"
tags: [back, onboarding, invitation, p0]
---

## Objectif utilisateur

Doter la plateforme d'un **pattern d'invitation unifié** réutilisable par tous les parcours d'onboarding par invitation (Owner, Agent, AgencyAdmin, ServiceProvider, super-admin coopté) — au lieu de dupliquer la logique invitation dans chaque flow.

## Contrat de données

Modèle `Invitation` (voir spec models §48) avec endpoints :

- `POST /api/invitations` — créer une invitation (body : `email`, `role`, `agency_id?`, `invitable_type`, `invitable_id`, `metadata?`). Renvoie l'invitation + envoie l'email automatiquement.
- `POST /api/invitations/{token}/accept` — accepter publiquement (pas d'auth requise initialement, le token signe l'identité). Crée le `User` si email non encore en base. Flippe `Invitation.status = accepted` et `<Profile>.status = active`. Attache le rôle spatie scopé sur `agency_id`.
- `POST /api/invitations/{id}/revoke` — l'inviteur révoque avant acceptation. Flippe `status = revoked`.
- `POST /api/invitations/{id}/resend` — l'inviteur régénère un token (reset `expires_at = now+7j`) et renvoie l'email.
- `GET /api/invitations` — liste des invitations émises par l'utilisateur courant (ou toutes pour super-admin) avec filtres `status`, `agency_id`.

Email transactionnel `InvitationMailable` localisé (FR/EN/WO) avec lien `https://app/invitations/accept?token=...`.

Job/cron `invitations:expire` (horaire) qui flippe `sent` → `expired` quand `expires_at < now` et envoie une notification à l'inviteur.

Job/cron `invitations:remind` (horaire) qui envoie un rappel J+2 (idempotent via `last_reminded_at`).

## Contraintes strictes (métier)

- Token = `Str::random(64)` URL-safe, unique en base, non devinable.
- Conflit email : si l'email correspond à un User existant, l'acceptation force `login + accept` (pas de signup).
- Une seule invitation `sent` par `(email, invitable_type, agency_id)` — empêcher les doublons (409 Conflict).
- L'inviteur doit avoir la permission `invite_<role>` dans son profil actif (gate Spatie). Un user `super_admin` peut créer toute invitation.
- Transaction unique à l'acceptation : si la création du User ou l'attachement du rôle échoue, rollback complet (l'invitation reste `sent`).
- Audit log : événements `invitation_sent`, `invitation_accepted`, `invitation_revoked`, `invitation_expired`.
- Permissions super-admin : peut révoquer toute invitation, peut lister cross-tenant.

## Delta à produire

- [ ] Migration : `create_invitations_table` (voir spec §48 pour colonnes)
- [ ] Enum : `App\Models\Enums\InvitationStatus` (`sent`, `accepted`, `expired`, `revoked`)
- [ ] Modèle : `App\Models\Invitation` avec scopes `pending()`, `expired()`, relations morph
- [ ] Service : `App\Services\Invitation\InvitationService` (méthodes `send`, `accept`, `revoke`, `resend`, `expire`)
- [ ] Controller : `App\Http\Controllers\InvitationController` (CRUD restreint)
- [ ] Public controller : `App\Http\Controllers\Public\InvitationAcceptController` (POST `/api/invitations/{token}/accept`)
- [ ] FormRequests : `CreateInvitationRequest`, `AcceptInvitationRequest`
- [ ] Mailable : `App\Mail\InvitationMailable` (templates Blade FR/EN/WO via lang/)
- [ ] Notifications : `InvitationAcceptedNotification` (à l'inviteur), `InvitationExpiredNotification`
- [ ] Console commands : `App\Console\Commands\ExpireInvitations`, `App\Console\Commands\RemindPendingInvitations`
- [ ] Schedule : enregistrer les 2 commands en horaire dans `Console\Kernel`
- [ ] Policy : `InvitationPolicy` (view/create/revoke selon rôles spatie)
- [ ] Tests : `tests/Feature/Invitation/` (envoi, acceptation nouvel user, acceptation user existant, conflit email, expiration, rappel J+2, révocation, dédoublonnage)

## Critères d'acceptation

- [ ] AC1 — `POST /api/invitations` crée l'invitation, le profil cible en `draft`, envoie l'email avec le token.
- [ ] AC2 — `POST /api/invitations/{token}/accept` crée le User si nouveau, flippe profil → `active`, attache rôle spatie scopé.
- [ ] AC3 — Email existant → l'acceptation passe par login (réponse 401 + flag `requires_login: true` + `email` retourné).
- [ ] AC4 — Création doublon `(email, invitable_type, agency_id)` avec invitation `sent` existante → 409 Conflict.
- [ ] AC5 — Cron `invitations:expire` flippe les invitations `sent` dont `expires_at < now`.
- [ ] AC6 — Cron `invitations:remind` envoie un rappel à J+2 et set `last_reminded_at` (idempotent au passage suivant).
- [ ] AC7 — Activity log entries présents pour les 4 événements clés.

## Hors périmètre

- UI form invitation par rôle (Owner/Agent/SP) — portée par TCK-256, 258, 260.
- Wizards d'onboarding post-acceptation — TCK-257, 259, 261.
- Cooptation super-admin (qui ajoute la contrainte 2FA forcé) — TCK-264.

## Notes d'implémentation

- Migration `2026_05_10_000001_create_invitations_table` créée selon §48 (token unique 64 chars, indexes `(email,status)` / `(invitable_type,invitable_id)` / `(status,expires_at)`).
- Enum `App\Models\Enums\InvitationStatus` (sent/accepted/expired/revoked) + ajout du case `Draft` à `OwnerProfileStatus` et `AgentProfileStatus` pour permettre la pré-création du profil cible.
- Modèle `App\Models\Invitation` avec scopes `pending()`/`expired()`, relations morph + `inviter`/`invitedUser`/`agency`, hidden `token`, casts datetimes/json/enum, normalisation email lowercase, factory `Database\Factories\InvitationFactory`.
- Service `App\Services\Invitation\InvitationService` (orchestration unique : `send`, `accept`, `acceptForAuthenticatedUser`, `revoke`, `resend`, `expire`, `remindPending`). Token = `Str::random(64)` avec retry sur collision. Acceptation = transaction unique (User + role spatie scopé team_id=agency_id + flip profile.status si applicable + flip Invitation.status). Email à l'extérieur de la transaction.
- Controllers : `Api\InvitationController` (index/store/show/revoke/resend, scope visibility par rôle) + `Public\InvitationAcceptController` (POST `/api/invitations/{token}/accept`, traduit le 401 service en `requires_login: true` + `email`).
- FormRequests : `Invitation\CreateInvitationRequest`, `Invitation\AcceptInvitationRequest`.
- Mailable `App\Mail\InvitationMailable` + template `resources/views/emails/invitation.blade.php` (FR/EN/WO via clés `notifications.invitation.*`). Subject distinct pour `isReminder`.
- Notifications : `InvitationAcceptedNotification`, `InvitationExpiredNotification` (envoyées à l'inviteur).
- Console commands : `invitations:expire` (hourly) + `invitations:remind` (hourly, idempotent via `last_reminded_at`, J+2). Programmées dans `routes/console.php`.
- Policy `App\Policies\InvitationPolicy` (viewAny/view/create/revoke/resend), enregistrée via `Gate::policy` dans `AppServiceProvider`. Super_admin bypass via le `Gate::before` global existant.
- Activity log via `spatie/laravel-activitylog` pour les 4 événements clés (`invitation_sent`, `_accepted`, `_revoked`, `_expired`) + bonus `_resent`.
- Routes : `routes/api/invitations.php` (auto-loaded par `routes/api.php`).
- Tests Feature : `tests/Feature/Invitation/{InvitationSendTest, InvitationAcceptTest, InvitationLifecycleTest}` — 26 tests couvrant AC1→AC7.
- i18n : `lang/{fr,en,wo}/invitations.php` + extensions `lang/{fr,en,wo}/notifications.php`.

### Hors-périmètre confirmé

- Création du profil polymorphe `draft` reste à charge des per-role wizards (TCK-256/258/260) — ce ticket expose `invitable_type`/`invitable_id` mais ne crée pas le profil.
- `ServiceProviderProfile` n'a pas de colonne `status` (lifecycle apporté par TCK-260) ; le service skip silencieusement le flip pour les morphs sans status.
- `InvitationPolicy::create` exige `agency_admin`/`admin` (ou super_admin). Les wizards qui appelleront directement `InvitationService::send()` (TCK-256/258/260) gèreront leur propre autorisation (ex. owner invitant un agent).
