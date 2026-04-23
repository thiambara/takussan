---
id: TCK-069
title: "Profile Security — 2FA, sessions actives, OTP téléphone"
status: review
phase: P1
family: applicatif
estimate: L
created: 2026-04-23
updated: 2026-04-23
depends_on: [TCK-013, TCK-060, TCK-057, TCK-054]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#2-user
tags: [auth, 2fa, totp, sessions, otp, front, back]
---

## Contexte

TCK-013 + TCK-060 sont `done` : auth Sanctum, OAuth Google, reset password, vérification email. La section sécurité de `/app/profile` expose un composant `ProfileSecuritySection` qui indique « Bientôt » pour 2FA, sessions actives et OTP téléphone. L'audit backend signale l'absence (ou l'implémentation simplifiée) de : TOTP avec codes de récupération, révocation de sessions actives, OTP SMS pour vérification téléphone.

Ticket full-stack : certains endpoints peuvent exister partiellement — à valider à l'implémentation. Si le backend couvre déjà partiellement (ex: `pragmarx/google2fa` ou équivalent), le ticket se concentre sur l'UI et la complétion des endpoints manquants.

## Objectif utilisateur

Un utilisateur (tous rôles) doit pouvoir sécuriser son compte : activer la 2FA par application TOTP avec codes de récupération, vérifier son téléphone via OTP SMS, et révoquer une session active depuis un autre appareil.

## Contrat de données

### Backend (à créer si absent)

- `POST /api/auth/2fa/enable` — génère un secret TOTP + QR code (retourne `secret`, `qr_code_url`)
- `POST /api/auth/2fa/confirm` — body `{ code: "123456" }` → active et retourne les `recovery_codes` (8 codes à stocker)
- `POST /api/auth/2fa/disable` — body `{ password }` ou `{ code }` pour confirmer
- `POST /api/auth/2fa/recovery-codes/regenerate` — nouveau lot de 8 codes
- `POST /api/auth/phone/send-otp` — envoie OTP SMS au `phone` du user (déjà présent dans TCK-013 ? à vérifier)
- `POST /api/auth/phone/verify-otp` — body `{ code }` → marque `phone_verified_at`
- `GET /api/auth/sessions` — liste les personal_access_tokens actifs (id, name, last_used_at, ip, user_agent)
- `DELETE /api/auth/sessions/{id}` — révoque un token (sauf le courant)

### Frontend (UI)

Section `ProfileSecuritySection` de `/app/profile` : remplacer les placeholders "Bientôt" par 3 sous-sections fonctionnelles.

## Direction UX / Artistique

Dashboard de sécurité sérieux et clair, à la GitHub / Cloudflare security settings. Chaque item = carte avec statut (activé/désactivé) + bouton principal + description courte. QR code affiché large au moment de l'activation 2FA, codes de récupération présentés une seule fois avec bouton "Télécharger" ou "Copier tout".

## Contraintes strictes (métier)

- Le secret TOTP et les recovery codes ne sont affichés qu'une seule fois à l'activation — impossible de les re-récupérer (seule la régénération est possible).
- Désactiver la 2FA demande confirmation par mot de passe OU code TOTP valide.
- Un utilisateur ne peut pas révoquer la session courante depuis cette UI (doit se déconnecter).
- L'OTP SMS expire après 5 minutes ; rate limit : 1 envoi / 60 secondes.
- Quand la 2FA est active, le login doit demander le code TOTP après password OK (→ backend auth flow à adapter si pas déjà).

## Delta à produire

### Backend

- [ ] Service `App\Services\Auth\TwoFactorService` avec génération secret, QR, verification, recovery codes
- [ ] Migration `add_2fa_columns_to_users` : `two_factor_secret` (encrypted), `two_factor_recovery_codes` (encrypted JSON), `two_factor_confirmed_at`
- [ ] `Auth\TwoFactorController` avec endpoints ci-dessus
- [ ] Modification du `LoginController` pour gérer le challenge 2FA après mot de passe
- [ ] Service `App\Services\Auth\PhoneVerificationService` avec OTP SMS (driver configurable — stub en dev)
- [ ] Endpoints `phone/send-otp` + `phone/verify-otp`
- [ ] Endpoint `GET/DELETE /api/auth/sessions` (liste + révocation des tokens Sanctum actifs)
- [ ] Tests Feature : activation 2FA, login avec 2FA, recovery code usage, phone OTP, session revocation

### Frontend

- [ ] Section "Authentification à deux facteurs" dans `/app/profile` (activation, QR, recovery codes, désactivation)
- [ ] Section "Téléphone vérifié" avec formulaire OTP + bouton renvoi (rate-limited)
- [ ] Section "Sessions actives" avec liste + bouton Révoquer (disabled sur la session courante)
- [ ] Adaptation du flow login : après POST /login, si `requires_2fa=true`, afficher champ code TOTP
- [ ] Tests Vitest : rendu sections, flow activation 2FA, flow verification OTP

## Critères d'acceptation

- [ ] AC1 — Activer la 2FA affiche un QR code, demande le premier code pour confirmer, et retourne 8 recovery codes à sauvegarder
- [ ] AC2 — Après activation, le login demande le code TOTP après mot de passe validé
- [ ] AC3 — Un recovery code valide permet de se connecter et est invalidé après usage
- [ ] AC4 — Envoyer un OTP SMS puis entrer le bon code marque `phone_verified_at`
- [ ] AC5 — La liste des sessions actives montre toutes les sessions Sanctum du user ; révoquer une session la détruit immédiatement (le token ne fonctionne plus)
- [ ] AC6 — Tenter de révoquer la session courante est bloqué (UI + backend)
- [ ] AC7 — `php artisan test` + `npm run test` verts, Pint clean

## Hors périmètre

- Passkeys / WebAuthn (EF)
- Magic link (P3)
- OAuth Facebook/Apple (P2, ticket séparé si besoin)
- Notifications email "nouvelle session détectée" (P2)

## Notes d'implémentation

**Bibliothèque 2FA** : `pragmarx/google2fa:^9.0` (composer). Wrap dans
`App\Services\Auth\TwoFactorService` — génération de secret (32 chars),
vérification TOTP avec fenêtre ±30s, génération de 8 recovery codes
(format `XXXXX-XXXXX`) stockés en clair dans une colonne `text` chiffrée
côté Eloquent (`protected $casts = [... => 'encrypted']`).

**Driver SMS** : stub de dev — `App\Services\Auth\PhoneVerificationService`
log l'OTP via `Log::channel(...)->info(...)` et renvoie le code dans la
réponse hors production (clé `debug_code`) pour les tests Feature. Prod
devra swap pour Twilio / Vonage / Orange API. OTP = 6 chiffres, TTL 5 min,
cooldown de renvoi 60 s, anti-abuse via route `throttle:3,1`.

**Sessions actives** : liste + révocation via les `personal_access_tokens`
Sanctum existants. Le token courant est exposé avec `current: true` et
refuse d'être supprimé (422 — message "use logout instead").

**Flow login 2FA** : première requête POST `/api/auth/login` avec
email/password retourne `{ requires_2fa: true }` (200) sans token. Le
client repose avec `two_factor_code` (TOTP) **ou** `recovery_code` (consommé
en single-use via `TwoFactorService::verifyRecoveryCode`). Un code
invalide renvoie 401.

**Frontend** : QR code rendu via `api.qrserver.com` en `<img>` (pas de
lib JS ajoutée) + secret affiché texte comme fallback (saisie manuelle).
Recovery codes affichés une seule fois immédiatement après confirm /
regenerate. Sessions listées via TanStack Query (évite l'avertissement
React Compiler sur `setState` dans `useEffect`).

**Tests** : 15 Feature tests back (TwoFactorTest, AuthLoginTest 2FA,
PhoneVerificationTest, SessionTest — incluant impossibilité de révoquer
sa propre session, consommation single-use des recovery codes, cooldown
429 sur send-otp). 9 tests front (TwoFactorSection, PhoneVerificationSection).

PR : https://github.com/thiambara/takussan/pull/47
