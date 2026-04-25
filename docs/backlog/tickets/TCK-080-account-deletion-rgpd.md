---
id: TCK-080
title: "Suppression de compte avec anonymisation (RGPD)"
status: review
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-013, TCK-018, TCK-069]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#7-customer
tags: [back, front, rgpd, gdpr, security, account]
---

## Objectif utilisateur

Permettre à un utilisateur (Locataire, Bailleur, Agent) d'initier lui-même la
suppression de son compte conformément au RGPD, avec une période de grâce
(30 jours) pour revenir en arrière, puis anonymisation irréversible des données
personnelles tout en préservant l'historique comptable/légal (paiements, baux,
factures) sous forme anonymisée.

## Contrat de données

**Backend — Service `App\Services\Account\AccountDeletionService`** :

- `requestDeletion(User $user, string $password, ?string $reason)` — crée une
  `AccountDeletionRequest` avec `scheduled_for = now()->addDays(30)`, envoie un
  email de confirmation, marque `User.deletion_requested_at`.
- `cancelDeletion(User $user)` — si `now() < scheduled_for`, annule et purge la
  request.
- `executeDeletion(User $user)` — appelé par la command scheduled ; anonymise et
  soft-delete.

**Endpoints** :

- `POST /api/auth/me/deletion-request` — body `{ password, reason? }`
- `DELETE /api/auth/me/deletion-request` — cancel
- `GET /api/auth/me/deletion-request` — status (scheduled_for, requested_at, reason)

**Command scheduled** `php artisan account:execute-deletions` — tourne
toutes les heures, exécute les requests dont `scheduled_for < now()`.

**Frontend** : section dans `/app/settings/account` avec bouton "Supprimer mon
compte" → modale 2-étapes (raison + ré-authentification password) → écran de
confirmation avec date d'effet et bouton "Annuler la demande".

## Direction UX / Artistique

**Confirmation en 2 étapes obligatoires** : la modale n'accepte pas un simple
clic — elle exige (1) sélection d'une raison dans un radio group (service
terminé, problème de qualité, vie privée, autre + texte libre) puis (2)
ré-authentification par password. Le bouton "Supprimer" reste grisé tant que
les deux étapes ne sont pas validées.

**Bandeau permanent post-demande** : une fois la demande active, afficher un
bandeau rouge sur toutes les pages authentifiées avec le compte à rebours
("Votre compte sera supprimé dans X jours. [Annuler la suppression]").

**Un email à chaque transition** : demande (jour J), rappel à J-7, exécution
finale (J+30) avec accusé de suppression téléchargeable.

## Contraintes strictes (métier)

- **Période de grâce 30 jours non ajustable** — configurable en `.env`
  uniquement (pas exposé en setting agence).
- **Ré-authentification obligatoire** — la request exige que le password soit
  fourni et re-vérifié serveur-side, même si l'utilisateur est déjà connecté.
  Si 2FA est actif (TCK-069), exiger aussi un code TOTP.
- **Anonymisation irréversible** post-exécution :
  - `User.email` → `deleted-{id}@takussan.local`
  - `User.first_name`, `last_name`, `phone`, `bio`, `avatar` → `null`
  - `User.google_id`, `facebook_id`, `apple_id` → `null`
  - `User.deleted_at` → now() (soft-delete)
  - **Ne PAS supprimer** : `BookingPayment`, `LeasePayment`, `Invoice`, `Lease`,
    `Booking`, `Payout`, `ActivityLog` — obligations comptables/légales
    (conservation 10 ans minimum).
  - `Customer` rattachés avec `user_id` → dissocier (`user_id=null`) mais
    conserver les `CustomerNote` et les interactions CRM.
- **Révocation de tokens** — tous les Sanctum tokens de l'user sont révoqués
  au moment de `requestDeletion` (pas à l'exécution). L'user est déconnecté
  immédiatement ; il peut se reconnecter pour annuler, ce qui recrée un token.
- **Anti-escalade** — un utilisateur avec un bail `active` ne peut PAS supprimer
  son compte sans résilier le bail au préalable. 422 avec liste des obligations
  en cours (baux actifs, paiements en attente).
- **Admin ne peut pas supprimer** un autre compte via cette route — elle est
  strictement `self-service`. L'admin passe par une route séparée (non incluse
  ici) avec audit dédié.
- **Journalisation obligatoire** — chaque transition (request, cancel, execute)
  est loggée dans `ActivityLog` avec l'acteur (l'user lui-même).

## Delta à produire

- [ ] Migration `create_account_deletion_requests_table` (user_id unique, requested_at, scheduled_for, reason, executed_at)
- [ ] Migration `add_deletion_requested_at_to_users_table` (index)
- [ ] Model `App\Models\AccountDeletionRequest`
- [ ] Service `App\Services\Account\AccountDeletionService` (request / cancel / execute / anonymize)
- [ ] Controller `App\Http\Controllers\Api\Auth\AccountDeletionController`
- [ ] FormRequest `RequestAccountDeletionRequest` (password + reason + 2FA si actif)
- [ ] Command `App\Console\Commands\ExecuteScheduledAccountDeletions`
- [ ] Schedule hourly dans `routes/console.php`
- [ ] Notifications `AccountDeletionRequestedNotification`, `AccountDeletionReminderNotification` (J-7), `AccountDeletionExecutedNotification`
- [ ] Policy `AccountDeletionPolicy` (only self)
- [ ] Routes `POST/DELETE/GET /api/auth/me/deletion-request`
- [ ] Tests `RequestDeletionTest` (password wrong → 422, baux actifs → 422, happy → 202 + scheduled_for + email)
- [ ] Tests `CancelDeletionTest` (happy + après expiration → 410)
- [ ] Tests `ExecuteDeletionTest` (anonymisation correcte, payments/leases conservés, user_id retiré des Customer)
- [ ] Tests `ScheduledExecutionTest` (command filtre correctement par date)
- [ ] Page UI `/app/settings/account` — section "Supprimer mon compte"
- [ ] Composant `AccountDeletionDialog` (2 étapes)
- [ ] Composant `AccountDeletionBanner` (bandeau global post-demande, compte à rebours)
- [ ] Bouton "Annuler la suppression" sur la banner
- [ ] i18n fr/en/wo (`account.deletion.*`)

## Critères d'acceptation

- [ ] AC1 — `POST /auth/me/deletion-request` avec password correct + aucune obligation → 202 + `scheduled_for` à J+30 + email envoyé
- [ ] AC2 — même endpoint avec bail `active` → 422 + liste des obligations à terminer
- [ ] AC3 — `DELETE /auth/me/deletion-request` avant J+30 → 204, l'user retrouve son compte normalement
- [ ] AC4 — la command scheduled anonymise l'user à J+30 : `email` réécrit, `first_name/last_name/phone/bio` à null, soft-delete posé
- [ ] AC5 — après exécution, les `BookingPayment`/`LeasePayment`/`Invoice` de l'user restent intacts et requêtables
- [ ] AC6 — après exécution, les `Customer` associés ont `user_id=null` (dissociés, pas supprimés)
- [ ] AC7 — tous les Sanctum tokens sont révoqués dès le `request`
- [ ] AC8 — si 2FA actif, `request` exige aussi un code TOTP valide
- [ ] AC9 — `ActivityLog` contient les 3 transitions (request, cancel si applicable, execute)
- [ ] AC10 — UI bandeau affiché sur toutes les pages authentifiées post-demande avec compte à rebours jour-précis

## Hors périmètre

- Suppression par l'admin d'un autre compte (ticket séparé — politique différente, audit renforcé).
- Export RGPD des données personnelles avant suppression (droit à la portabilité — ticket dédié P2/P3).
- Suppression **immédiate** sans délai (non demandée par la spec et contraire au RGPD qui autorise le délai).
- Suppression d'un compte Agence (la suppression d'une agence est un scénario admin distinct).

## Notes d'implémentation

- **Service** `AccountDeletionService` — `requestDeletion / cancelDeletion / executeDeletion / anonymizeUser`. Délai de grâce paramétrable via `config/account.php` → `deletion_grace_days` (default 30, surcharge `.env` `ACCOUNT_DELETION_GRACE_DAYS`).
- **Anti-escalade** : refus 422 si l'utilisateur est landlord avec `Lease.active`, ou s'il a des `LeasePayment` pending via une relation customer. Liste les obligations dans la réponse pour permettre à l'utilisateur de les fermer.
- **Tokens revoked at request time** (pas à l'exécution) — l'utilisateur est déconnecté immédiatement ; il peut se reconnecter (re-créant un token) pour annuler.
- **2FA** : si `two_factor_enabled`, un code TOTP valide est exigé en plus du password (re-vérifié serveur-side via `Google2FA`).
- **Anonymisation** : `email → deleted-{id}@takussan.local`, `first_name/last_name/phone/bio/avatar/google_id/facebook_id/apple_id → null`, `deleted_at → now`. `BookingPayment`/`LeasePayment`/`Invoice`/`Lease`/`Booking`/`Payout`/`ActivityLog` **conservés** (obligations comptables 10 ans). `Customer` rattachés via `user_id` → dissociés (`user_id=null`), notes/interactions CRM préservées.
- **Command** `account:execute-deletions` schedulé `hourly` dans `routes/console.php` ; envoie aussi le rappel J-7 (idempotent via `metadata.reminder_sent_at`). `--dry-run` ne mute rien.
- **ActivityLog** : 3 transitions loggées (request / cancel / execute) avec acteur = self.
- **Frontend** : `<AccountDeletionSection>` placé dans `/app/profile/security` (composé dans `<ProfileSecuritySection>`), `<AccountDeletionDialog>` 2-step (radio raison + password + 2FA si actif), `<AccountDeletionBanner>` global dans le layout dashboard avec compte à rebours jour-précis et bouton "Annuler". Server actions dans `app/actions/account-deletion.ts`.
- **Hors périmètre confirmés** : suppression admin d'un autre compte, export RGPD (portabilité), suppression immédiate, suppression d'agence.
- **Tests** : 22 verts (`AccountDeletionRequestTest` 7, `AccountDeletionCancelTest` 4, `AccountDeletionExecuteTest` 7, `AccountDeletionScheduledTest` 4) + Vitest 338/338 (pas de nouveaux tests frontend ajoutés — composants UI simples, à enrichir si besoin via TCK-cleanup).
- **PR** : feat/tck-080-account-deletion-rgpd → dev (à ouvrir).
