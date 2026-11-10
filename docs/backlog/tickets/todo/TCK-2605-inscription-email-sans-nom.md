---
id: TCK-2605
title: "Inscription par e-mail : l'adresse et le mot de passe suffisent, le prénom vient après"
status: todo
phase: P2
family: back
estimate: S
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2606]
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, auth, audit-ux, app]
---

## Objectif utilisateur

La personne qui s'inscrit par e-mail n'a que trois contrôles à remplir (adresse, mot de passe, conditions), comme celle qui s'inscrit par téléphone n'en a qu'un ; son prénom lui est demandé à l'écran suivant.

## Contrat de données

Re-mesure sur `dev` (1bce3798a) : `POST /api/auth/register` (`RegisterRequest`) exige `first_name`, `last_name` et `password` **confirmé** (`password_confirmation`). Un compte né par téléphone ou par Google naît sans prénom, et l'étape prénom de `/onboarding/intention` (`EtapePrenom`) le demande déjà.

- `RegisterRequest` : `first_name` et `last_name` deviennent `sometimes|nullable|string|max:100` ; `password` perd `confirmed` (une `password_confirmation` envoyée reste acceptée et vérifiée si elle est présente).
- `AuthController::register` écrit `''` pour un prénom ou un nom absent, comme le fait la création par téléphone.

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0095](../../../adr/0095-le-ton-suit-la-session.md).
- Rétrocompatible : un corps d'aujourd'hui (prénom, nom, mot de passe confirmé) rend la même réponse.
- Une `password_confirmation` présente et différente rend toujours 422 sur `password`.
- Les règles du mot de passe (`Password::defaults()`), l'unicité de l'e-mail, le limiteur `auth-register`, l'ouverture de session immédiate (TCK-589) et l'e-mail de vérification ne changent pas.

## Delta à produire

- [ ] `RegisterRequest` assoupli comme ci-dessus.
- [ ] `AuthController::register` : prénom / nom par défaut `''`.
- [ ] Tests : `RegisterWithoutNameTest` — e-mail + mot de passe seuls → 201, session, `first_name = ''` ; confirmation présente et différente → 422 ; corps d'aujourd'hui → réponse inchangée.

## Critères d'acceptation

- [ ] AC1 — `POST /api/auth/register {email, password}` rend 201 avec un jeton, et l'utilisateur a `first_name = ''`.
- [ ] AC2 — `{email, password, password_confirmation: "autre"}` rend 422 sur `password`.
- [ ] AC3 — Le test d'inscription existant passe sans modification de son corps.

## Hors périmètre

- L'écran (TCK-2606).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
