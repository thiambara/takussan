---
id: TCK-169
title: Login — match email insensible à la casse (cohérence frontend ↔ backend)
status: done
phase: P1
family: bug
estimate: S
wave: 19
created: 2026-05-05
updated: 2026-08-12
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models:
    - docs/models-spec.md#1-user
tags: [back, auth, sqlite]
---

## Objectif utilisateur

Un utilisateur doit pouvoir se connecter avec son email tel qu'il l'a renseigné à l'inscription, indépendamment de la casse — `Marie.Dupont@example.com` et `marie.dupont@example.com` doivent désigner le même compte.

## Contrat de données

Bug de cohérence entre frontend (Next.js) et backend (Laravel + SQLite).

- Le frontend envoie l'email **en minuscules** au POST `/api/auth/login` (smoke test : observé sur `malick-toure-Zh5v@example.com` → reçu `malick-toure-zh5v@example.com`).
- Le backend (`app/Http/Controllers/Auth/AuthController@login`) cherche par `User::where('email', $request->input('email'))->first()` ; SQLite est case-sensitive sur `=` par défaut, donc le lookup échoue → 401 « Invalid credentials. ».
- Tous les comptes seedés avec une majuscule dans l'email sont **inutilisables**.

## Contraintes strictes (métier)

- Préserver l'unicité d'email : `marie.dupont@…` et `MARIE.DUPONT@…` ne doivent pas coexister en deux lignes différentes après ce fix.
- Tous les autres lookups par email (reset password, vérification email, recherche utilisateur côté admin) doivent suivre la même règle d'insensibilité.

## Delta à produire

- [ ] Migration: normaliser tous les emails existants à `LOWER(email)` (avec dédoublonnage explicite + log si conflit).
- [ ] Mutator `User::setEmailAttribute` qui force `strtolower(trim($value))`.
- [ ] FormRequest `LoginRequest` (et `ForgotPasswordRequest`, `RegisterRequest`) qui appliquent `strtolower` avant validation `unique:users,email`.
- [ ] Index SQL unique sur `LOWER(email)` (ou contrainte applicative documentée si SQLite ne supporte pas `LOWER` index sur cette version).
- [ ] Test `AuthLoginCaseInsensitiveTest` couvrant : login avec maj/min, register avec doublon majuscule/minuscule rejeté, reset password.
- [ ] Vérifier que le seeder factory `UserFactory` produit bien des emails en minuscules (sinon : forcer).

## Critères d'acceptation

- [ ] POST `/api/auth/login` avec `Marie.Dupont@example.com` / mot de passe correct → 200 si l'utilisateur existe en DB (peu importe sa casse stockée).
- [ ] Inscription avec un email qui ne diffère que par la casse d'un email existant → 422 « email déjà utilisé ».
- [ ] Tous les emails en DB après migration sont en minuscules ; aucune ligne dupliquée.
- [ ] Le smoke test customer (`docs/qa/locataire-acheteur-qa.md` TC-LOC-01) passe sans intervention manuelle.

## Hors périmètre

- Migration vers Postgres avec `CITEXT` (changement d'infra hors scope).
- Vérification de l'email (déjà câblée via `email_verified_at`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
