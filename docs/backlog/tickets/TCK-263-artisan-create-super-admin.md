---
id: TCK-263
title: "Commande artisan create-super-admin (bootstrap)"
status: done
phase: P0
family: back
estimate: S
created: 2026-05-10
updated: 2026-05-10
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#29-administration--configuration"
  models:
    - "docs/models-spec.md#1-user"
tags: [back, ops, super-admin, bootstrap, p0]
---

## Objectif utilisateur

Un opérateur (ops/dev) qui installe Takussan dans un nouvel environnement doit pouvoir **créer le premier super-admin** depuis la ligne de commande, sans passer par l'UI ni manipuler la base à la main.

## Contrat de données

Commande artisan :

```
php artisan takussan:create-super-admin
```

Prompts interactifs :
- email (validation email + unicité)
- password (force imposée : 12+ caractères, 1 maj, 1 min, 1 chiffre, 1 spécial)
- first_name, last_name
- locale (défaut FR)

Action :
1. Crée `User` avec mot de passe hashé.
2. Génère 2FA TOTP secret + 8 codes de récupération.
3. Affiche les codes de récupération **une seule fois** dans le terminal (impression / capture obligatoire).
4. Attache le rôle spatie `super_admin` (global, sans `team_id`).
5. Marque `email_verified_at = now()` (l'opérateur a créé le compte intentionnellement).
6. Active un flag `force_2fa_at_first_login = true` (à enforcer côté login).

Mode non-interactif via flags pour CI :

```
php artisan takussan:create-super-admin --email=foo@bar.com --password=... --first-name=... --last-name=... --no-interaction
```

## Contraintes strictes (métier)

- Email doit être unique (sinon erreur claire).
- Mot de passe doit respecter la policy (sinon refus + retry).
- En `--no-interaction` sans tous les flags requis → erreur.
- 2FA obligatoire au premier login web (à implémenter côté auth dans une autre tâche, mais le flag `force_2fa_at_first_login` est posé ici).
- Activity log : événement `super_admin_bootstrapped` avec source = "artisan".

## Delta à produire

- [ ] Commande : `App\Console\Commands\CreateSuperAdmin`
- [ ] Service : `App\Services\Auth\SuperAdminBootstrapService` (réutilisable depuis cooptation TCK-264)
- [ ] Migration : ajout `force_2fa_at_first_login` (boolean, default false) sur `users` si pas déjà existant
- [ ] Tests : `tests/Feature/Console/CreateSuperAdminTest.php`
  - mode interactif (mock prompts)
  - mode `--no-interaction`
  - email dupliqué
  - mot de passe faible
  - 2FA secret généré, codes affichés une seule fois
  - rôle spatie attaché
  - activity log

## Critères d'acceptation

- [ ] AC1 — `php artisan takussan:create-super-admin` interactif crée un User avec rôle super_admin et 2FA actif.
- [ ] AC2 — Les 8 codes de récupération sont affichés dans le terminal en clair une seule fois.
- [ ] AC3 — Mode `--no-interaction` fonctionne avec tous les flags.
- [ ] AC4 — Email dupliqué refusé avec message clair.
- [ ] AC5 — Activity log entry `super_admin_bootstrapped` créée.

## Hors périmètre

- Enforcement du `force_2fa_at_first_login` côté login web — autre ticket auth.
- Cooptation peer-to-peer entre super-admins — TCK-264.

## Notes d'implémentation

_(à remplir par implementing-specs)_
