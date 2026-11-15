---
id: TCK-2926
title: "Fiche d'un membre : la ventilation de son portefeuille, l'ancienneté de ses commissions dues, l'appareil de sa dernière connexion, la date de sa double authentification, et le rappel de l'activer"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2928]
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  models:
    - "docs/models-spec.md#1-user"
    - "docs/models-spec.md#35-agentprofile-"
tags: [back, equipe, membre, securite, 2fa, audit-ux, audit-2026-11-15]
---

## Objectif utilisateur

L'admin lit sur la fiche d'un membre ce qu'il suit, ce qu'on lui doit depuis quand, d'où il s'est connecté et depuis quand sa double authentification est active, et le relance s'il ne l'a pas activée.

## Contrat de données

Écarts acceptés de TCK-2667 (`a-1`, « vérité des données » / « hors périmètre ») : ces données n'existent pas dans la réponse de l'équipe (`GET /api/agencies/{agency}/team`). Relevé du 2026-11-15 : `users` porte `last_login_at` mais ni appareil ni ville ; `two_factor_enabled` est un booléen sans date ; aucune route n'envoie de rappel 2FA.

À servir par une route neuve `GET /api/agencies/{agency}/team/{user}` (`TeamMemberController@show`), la fiche d'un membre :

- `portfolio` : biens suivis par statut (`rented`, `available`, `for_sale`, …), clients actifs, visites de la semaine ;
- `commissions_due` : montant, nombre de baux, date de la plus ancienne ligne due ;
- `last_login` : `at`, `device` (famille d'appareil et de navigateur lue du `User-Agent` de la connexion), `city` (ville seule) ;
- `two_factor_enabled_at` ;
- `POST /api/agencies/{agency}/team/{user}/two-factor-reminder` : notification à code (ADR-0032) au membre ;
- la liste des biens filtrable par agent responsable : `GET /api/properties?filter[agent]={user}` (sur `Property::scopeManagedBy`, la même règle que « Mes chiffres ») ; les clients ont déjà `filter[referent]` (`Customer.php:319`), réutilisé tel quel.

## Contraintes strictes (métier)

- **Donnée personnelle neuve** (appareil, ville de connexion) : l'ADR s'écrit AVANT (numéro suivant libre) — ce qui est gardé (ville seule, jamais l'IP en clair ni l'empreinte), combien de temps, qui le lit ([ADR-0044](../../../adr/0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)).
- Lu par qui gère l'équipe (mêmes règles que la fiche actuelle) ; rien de neuf pour un agent sur un autre agent.
- La ville vient d'une résolution locale (base hors ligne) au moment de la connexion ; aucune IP n'est envoyée à un service tiers. Sans résolution, `city: null`.
- Rappel 2FA : refusé (409) si la 2FA est déjà active ; une fois par 24 h et par membre (429 au-delà).
- Migration(s) PostgreSQL avec `down()` juste : `users.last_login_device`, `users.last_login_city`, `users.two_factor_enabled_at` (rempli à l'activation, `null` à la désactivation).

## Delta à produire

- [ ] ADR « appareil et ville de la dernière connexion ».
- [ ] Migration(s) + écriture à la connexion (toutes les voies : mot de passe, code SMS, Google) et à l'activation 2FA.
- [ ] `TeamMemberController@show` ; filtre `agent` des biens.
- [ ] Route du rappel 2FA, notification `TwoFactorReminder` (fr/en/wo côté front).
- [ ] Tests : `TeamMemberSheetTest`, `TwoFactorReminderTest`, `LastLoginDeviceTest`.

## Critères d'acceptation

- [ ] AC1 — Un agent qui suit 3 biens loués et 2 à louer a `portfolio.properties` = `{rented: 3, available: 2}` (total 5) ; un bien d'un autre agent n'y compte pas.
- [ ] AC2 — Avec deux lignes de commission dues (30 oct. et 5 nov.) sur deux baux, `commissions_due` rend le total, `leases: 2`, `oldest_due_at: 2026-10-30`.
- [ ] AC3 — Après une connexion avec un `User-Agent` d'iPhone Safari, `last_login.device` décrit « iPhone · Safari » et aucune colonne ne contient l'IP. Après activation 2FA, `two_factor_enabled_at` est la date de l'activation ; après désactivation, `null`.
- [ ] AC4 — `POST …/two-factor-reminder` sur un membre sans 2FA envoie une notification (une seule ligne de notification) ; deuxième appel dans les 24 h → 429 ; membre avec 2FA → 409 ; appelant agent → 403.
- [ ] AC5 — `GET /api/properties?filter[agent]={id}` ne rend que les biens que cet agent gère (même ensemble que `scopeManagedBy`), dans l'agence de l'appelant ; un agent d'une autre agence en `filter[agent]` rend une liste vide.

## Hors périmètre

- L'écran (TCK-2928).

## Notes d'implémentation

_(à remplir par implementing-specs)_
