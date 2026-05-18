---
id: TCK-264
title: "Cooptation super-admin — invitation peer-to-peer + 2FA forcé"
status: done
phase: P1
family: applicatif
estimate: M
created: 2026-05-10
updated: 2026-05-10
depends_on: [TCK-249, TCK-263]
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#1-user"
tags: [back, front, super-admin, onboarding, p1]
---

## Objectif utilisateur

Un super-admin existant doit pouvoir **coopter un autre super-admin** depuis la console super-admin, avec 2FA TOTP **obligatoire** avant `active`, audit log automatique, et notification broadcast aux autres super-admins (transparence).

## Contrat de données

Repose sur le pattern Invitation unifié (TCK-249) avec spécialisation :

- `POST /api/admin/super-admins/invite` — endpoint super-admin-only. Crée une `Invitation` avec `role = super_admin`, `agency_id = null` (rôle global), `metadata = { requires_2fa: true }`.
- `POST /api/invitations/{token}/accept` standard, **mais** si `role = super_admin`, le flow d'acceptation est étendu :
  1. Acceptation initiale → User créé/login, `Invitation.status = accepted`, mais `User.force_2fa_at_first_login = true` posé.
  2. À la première connexion, écran de configuration 2FA TOTP **bloquant** (impossible de skipper) — secret + 8 codes de récupération générés.
  3. Une fois le 2FA validé, le rôle spatie `super_admin` est attaché et l'utilisateur est redirigé vers la console super-admin.

Notification :
- À l'envoi de l'invitation : tous les autres super-admins reçoivent une notification "X a invité Y comme super-admin".
- À l'acceptation : tous les super-admins reçoivent une notification "Y est désormais super-admin".

## Contraintes strictes (métier)

- Endpoint `/api/admin/super-admins/invite` accessible **uniquement aux super_admin** (gate `EnsureSuperAdmin`).
- Un seul super-admin reviewer suffit (pas de double-validation MVP).
- 2FA TOTP est **bloquant** avant l'attache du rôle — un super-admin sans 2FA n'existe pas.
- Activity log : `super_admin_invited`, `super_admin_2fa_enrolled`, `super_admin_role_attached` avec actor + target.
- Pas de révocation possible sur un super-admin déjà accepté via cet endpoint — la suspension/retrait passe par un autre flow (existant ou à créer).

## Delta à produire

- [ ] Endpoint `POST /api/admin/super-admins/invite`
- [ ] Service : étendre `InvitationService::accept` pour gérer le cas `role = super_admin` (différer l'attache du rôle jusqu'à validation 2FA)
- [ ] Service : `App\Services\Auth\SuperAdminCooptationService` (orchestration)
- [ ] Notifications : `SuperAdminInvitedBroadcast` (à tous les super-admins), `SuperAdminAcceptedBroadcast`
- [ ] Page frontend `/super-admin/super-admins` (liste + bouton "Inviter")
- [ ] Modal `<InviteSuperAdminModal>` (email + first/last name)
- [ ] Page frontend `/onboarding/super-admin/{token}` post-acceptation : 2FA enrollment bloquant
- [ ] Composant `<TotpEnrollment>` (QR code + saisie code + affichage codes récupération une seule fois)
- [ ] Tests backend : invitation, acceptation, 2FA bloquant, attache rôle après 2FA, broadcast notifications, activity log
- [ ] Tests E2E : flow complet
- [ ] i18n FR/EN/WO

## Critères d'acceptation

- [ ] AC1 — Un super-admin invite un nouveau super-admin, l'email est envoyé.
- [ ] AC2 — À l'acceptation, l'utilisateur ne peut pas accéder à la console super-admin tant que le 2FA n'est pas configuré.
- [ ] AC3 — Une fois le 2FA validé, le rôle spatie `super_admin` est attaché et la redirection vers `/super-admin` est effective.
- [ ] AC4 — Tous les super-admins reçoivent une notification à l'invitation et à l'acceptation.
- [ ] AC5 — Activity log entries pour les 3 événements clés.
- [ ] AC6 — Un user non super-admin appelant l'endpoint reçoit 403.

## Hors périmètre

- Suspension / retrait d'un super-admin existant — autre ticket.
- Double-validation par 2 super-admins (audit renforcé) — V2.

## Notes d'implémentation

**Décisions clés**

- **Pas de policy spatie pour le gating**. Le `EnsureSuperAdmin` middleware existe déjà (TCK-144) et garde le namespace `/api/admin/*`. On l'a réutilisé tel quel pour `POST /api/admin/super-admins/invite`. Le service `SuperAdminCooptationService::invite()` re-vérifie défensivement via `User::isSuperAdmin()` (qui pin le team à null) — défense en profondeur, pas de gate spatie supplémentaire.
- **2FA bloque l'attache du rôle au niveau de `finalizeAccept`**. Plutôt que de créer un état `pending_2fa` sur Invitation, on a réutilisé la colonne `force_2fa_at_first_login` de TCK-263. À l'acceptation : `User` créé, flag posé, invitation passée à `accepted` (pour ne pas duplicer l'état machine), MAIS rôle spatie NON attaché. Activity log `super_admin_role_pending` ajouté pour la traçabilité. L'attache du rôle se fait *uniquement* dans `POST /api/auth/super-admin/2fa/confirm` — endpoint dédié qui hérite de la logique de `SuperAdminBootstrapService::attachSuperAdminRole` (probe team-id null + `firstOrCreate` du rôle).
- **Endpoints TOTP super-admin dédiés** (pas une variante de `/api/auth/two-factor/*`). Raisons : (1) recovery codes hashés en DB et émis en clair *une seule fois* à l'enroll (mirror du bootstrap), (2) gating spécifique par `force_2fa_at_first_login = true` au lieu de `auth:sanctum + role check` standard, (3) confirm fait l'attache du rôle + le broadcast aux pairs — opération métier qui n'a rien à faire dans le contrôleur 2FA générique.
- **Notifications broadcast** via `Notification::send($recipients, ...)` queueable (database + mail). `superAdmins()` qualifie `roles.name` / `roles.team_id` car spatie injecte une clause `agency_id IS NULL` non-qualifiée sur la table pivot, ce qui collisionne avec le `agency_id` de `users`.
- **Frontend** : `<TotpEnrollment>` (TCK-270) gardé intact ; un wizard dédié `<SuperAdminOnboardingWizard>` réplique la state machine intro→scanning→success en pointant vers les actions `superAdminTwoFactor*Action`. Recovery codes affichés depuis la réponse `/enroll` (pas `/confirm`) puisque le confirm super-admin ne les ré-émet pas. Layouts `(dashboard)` + `(super-admin)/super-admin` détectent `force_2fa_at_first_login` et bouncent sur `/onboarding/super-admin`.

**Fichiers touchés**

Backend :
- `app/Services/Auth/SuperAdminCooptationService.php` (nouveau)
- `app/Services/Invitation/InvitationService.php` (`finalizeAccept` étendu — branche `super_admin`)
- `app/Http/Controllers/Api/Admin/SuperAdminInvitationController.php` (nouveau)
- `app/Http/Controllers/Api/Auth/SuperAdminTwoFactorController.php` (nouveau)
- `app/Http/Requests/Admin/InviteSuperAdminRequest.php` (nouveau)
- `app/Http/Resources/UserResource.php` (expose `force_2fa_at_first_login`)
- `app/Notifications/SuperAdminInvitedBroadcast.php` (nouveau)
- `app/Notifications/SuperAdminAcceptedBroadcast.php` (nouveau)
- `routes/api/admin.php` + `routes/api/auth.php` (routes ajoutées)
- `lang/{fr,en,wo}/super_admins.php` (nouveaux)
- `tests/Feature/Auth/SuperAdminCooptationTest.php` (10 tests)

Frontend :
- `src/app/(super-admin)/super-admin/super-admins/page.tsx` (nouveau)
- `src/app/onboarding/super-admin/page.tsx` (nouveau)
- `src/app/(dashboard)/layout.tsx` + `src/app/(super-admin)/super-admin/layout.tsx` (gates ajoutés)
- `src/app/actions/super-admin-cooptation.ts` (nouveau)
- `src/components/super-admin/InviteSuperAdminModal.tsx` (nouveau)
- `src/components/super-admin/SuperAdminOnboardingWizard.tsx` (nouveau)
- `src/components/layout/SuperAdminSidebar.tsx` (lien sidebar ajouté)
- `src/lib/queries/super-admin.ts` + `src/lib/security.ts` (helpers ajoutés)
- `src/types/user.ts` (champ `force_2fa_at_first_login`)
- `src/components/super-admin/__tests__/InviteSuperAdminModal.test.tsx` (nouveau)

**Hors périmètre confirmé** : suspension/retrait d'un super-admin existant, double-validation V2.
