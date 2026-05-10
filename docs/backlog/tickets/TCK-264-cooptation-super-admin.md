---
id: TCK-264
title: "Cooptation super-admin — invitation peer-to-peer + 2FA forcé"
status: todo
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

_(à remplir par implementing-specs)_
