---
id: TCK-211
title: "Super-admin — Actions support utilisateur (reset password, unlock, 2FA, sessions)"
status: done
phase: P1
family: applicatif
estimate: M
wave: 23
created: 2026-05-07
updated: 2026-05-07
depends_on: [TCK-210]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
    - docs/features.md#29-administration--configuration
    - docs/features.md#26-audit--traçabilité
  models:
    - docs/models-spec.md#1-user
tags: [back, front, super_admin, p1]
---

## Contexte

Une fois la fiche utilisateur livrée (TCK-210), le support doit pouvoir intervenir sur un compte sans recourir à l'impersonation : déclencher un reset password, débloquer un compte verrouillé, réinitialiser la 2FA, révoquer les sessions actives. Aujourd'hui ces actions n'existent pas dans l'API admin — le support ouvre une console artisan.

## Objectif utilisateur

Depuis `/super-admin/users/[id]`, le super-admin déclenche en un clic et avec double confirmation les actions de support — chaque action est journalisée.

## Contrat de données

Endpoints à exposer :

- `POST /api/admin/users/{id}/force-password-reset` — invalide le password courant, envoie un mail de reset (token court ≤ 1h), invalide les tokens Sanctum
- `POST /api/admin/users/{id}/unlock` — clear `locked_at` / compteur de tentatives échouées
- `POST /api/admin/users/{id}/reset-2fa` — désactive la 2FA et force la reconfiguration au prochain login
- `POST /api/admin/users/{id}/revoke-sessions` — révoque tous les tokens Sanctum (sauf optionnellement le token de l'acteur)
- `DELETE /api/admin/users/{id}/sessions/{tokenId}` — révoque un token précis

Tous ces endpoints renvoient `{success: true, action_id}` et journalisent un événement spatie/activitylog.

## Direction UX / Artistique

Boutons d'action regroupés dans un menu "Actions support" sur la fiche utilisateur. Modale de double confirmation pour chaque action, avec champ "raison" obligatoire (texte libre court, persisté dans l'audit). Toast de succès + invalidation du cache React Query de la fiche.

## Contraintes strictes (métier)

- Endpoints super-admin-only (sous `/api/admin/`).
- Chaque action loggue obligatoirement via `LogsActivity` avec : `actor_id`, `target_user_id`, `reason` (champ saisi par l'opérateur), `event` (ex. `super_admin_password_reset_forced`).
- L'action `force-password-reset` invalide tous les tokens existants (sécurité).
- L'action `revoke-sessions` ne peut pas révoquer le token courant du super-admin (sinon il se déconnecte) — option par défaut "garder ma session".
- La modale impose la saisie d'une `raison` non vide avant validation.
- Les actions ne sont jamais idempotentes silencieuses : elles renvoient une erreur explicite si l'état cible est déjà atteint (ex. compte déjà non-verrouillé).
- Aucune action ne s'applique à un autre `super_admin` sans un second `super_admin` opérant (auto-protection — refusée 409 avec message).

## Delta à produire

- [ ] Backend FormRequests `Api\Admin\Support\{ForcePasswordResetRequest, UnlockRequest, Reset2faRequest, RevokeSessionsRequest}`
- [ ] Service `App\Services\Admin\UserSupportService` (centralise les actions et l'audit)
- [ ] Controller `Admin\UserSupportController` (5 actions)
- [ ] Routes `routes/api/admin.php`
- [ ] Activity log : événements dédiés (`super_admin_password_reset_forced`, `super_admin_account_unlocked`, `super_admin_2fa_reset`, `super_admin_sessions_revoked`)
- [ ] Frontend menu `UserSupportActionsMenu` + 4 modales de confirmation avec champ raison
- [ ] Tests backend : succès, 403 hors super-admin, refus self-action sur un autre super-admin, audit présent, tokens révoqués vérifiables
- [ ] Tests UI : déclenchement modal, raison obligatoire, refresh fiche

## Critères d'acceptation

- [ ] Les 5 endpoints renvoient 403 pour un agency_admin
- [ ] `force-password-reset` invalide tous les tokens Sanctum de l'utilisateur cible
- [ ] Chaque action génère une entrée d'audit avec `reason` non null et visible dans `/super-admin/audit`
- [ ] Aucune action ne peut être déclenchée sans modale de confirmation côté UI
- [ ] La révocation de sessions n'écarte pas le super-admin opérant
- [ ] Une tentative d'action sur un autre `super_admin` retourne 409 avec un message explicite

## Hors périmètre

- Fusion de comptes utilisateurs (extension de spec requise — pas de modèle `account_merge` aujourd'hui)
- Suppression / anonymisation conforme RGPD (extension de spec requise)
- Édition des champs utilisateur (nom, email) depuis la console — pas couvert

## Notes d'implémentation

Le modèle `users` n'a pas de colonnes `locked_at` / compteur dédiées ; l'action unlock opère sur `metadata.locked_at` et `metadata.failed_login_attempts`.
