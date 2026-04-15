---
id: TCK-013
title: Authentification & gestion de comptes
status: todo
phase: P0
family: applicatif
estimate: L
created: 2026-04-15
updated: 2026-04-16
depends_on: []
blocks: [TCK-014, TCK-015, TCK-019, TCK-020, TCK-021, TCK-022, TCK-023, TCK-029, TCK-033]
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, front, auth, sanctum, socialite]
---

## Contexte

Le backlog ne contient aucun ticket couvrant l'authentification ni la gestion de comptes. Ce domaine est la fondation de toute la plateforme — aucun autre domaine ne peut fonctionner sans lui.

## Objectif

Implémenter le cycle complet d'authentification et de gestion de profil utilisateur décrit dans `features.md §2.1-authentification--comptes`.

## Delta à produire

### P0 — MVP bloquant

- [ ] Endpoint `POST /api/auth/register` (inscription email + mot de passe)
- [ ] Endpoint `POST /api/auth/login` (connexion Sanctum, retour token)
- [ ] Endpoint `POST /api/auth/logout` (révocation de token)
- [ ] Endpoint `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`
- [ ] Endpoint `POST /api/auth/verify-email/{id}/{hash}` + renvoi de lien
- [ ] Endpoint `GET /api/auth/me` + `PUT /api/auth/profile` (édition profil : nom, bio, avatar)
- [ ] Pages Next.js : Login, Register, Forgot Password, Reset Password, Email Verification, Profile Edit
- [ ] Tests : `AuthRegistrationTest`, `AuthLoginTest`, `AuthPasswordResetTest`, `AuthEmailVerificationTest`, `AuthProfileTest`

### P1 — MVP important

- [ ] Endpoint vérification téléphone SMS/OTP (`POST /api/auth/verify-phone`)
- [ ] OAuth Google via Socialite (`GET /api/auth/google`, `GET /api/auth/google/callback`)
- [ ] 2FA TOTP : activation, vérification, codes de récupération (`POST /api/auth/2fa/*`)
- [ ] Endpoint gestion sessions actives (`GET /api/auth/sessions`, `DELETE /api/auth/sessions/{id}`)
- [ ] Rate limiting sur les endpoints sensibles : 5 tentatives de login / 10 min par IP (via `ThrottleRequests` + config `config/auth.php`)
- [ ] Tests : `AuthOAuthTest`, `Auth2FATest`, `AuthSessionsTest`, `AuthRateLimitingTest`

### P2

- [ ] Suppression de compte avec anonymisation RGPD (`DELETE /api/auth/account`)
- [ ] OAuth Facebook + Apple (Socialite)
- [ ] Tests : `AuthAccountDeletionTest`, `AuthOAuthFacebookTest`

### P3

- [ ] Magic link de connexion (`POST /api/auth/magic-link`)

## Critères d'acceptation

- [ ] Un visiteur peut s'inscrire, vérifier son email et se connecter
- [ ] Un utilisateur connecté peut éditer son profil et changer son mot de passe
- [ ] La déconnexion révoque le token Sanctum actif
- [ ] Le mot de passe oublié envoie un email avec un lien de réinitialisation fonctionnel
- [ ] Les tokens expirent selon la configuration Sanctum
- [ ] Les pages Next.js gèrent les erreurs de validation et les redirections post-auth
- [ ] Après 5 tentatives de login échouées en 10 min, l'IP reçoit 429 Too Many Requests

## Hors périmètre

- Rôles et permissions (→ TCK-014)
- Notifications email transactionnelles au-delà de la vérification (→ TCK-022)

## Notes d'implémentation

_(à remplir par implementing-specs)_
