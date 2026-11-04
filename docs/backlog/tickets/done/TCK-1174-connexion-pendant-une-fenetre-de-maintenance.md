---
id: TCK-1174
title: "La connexion et /auth/me échappent à la fenêtre de maintenance"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, maintenance, auth, super-admin, pistes]
---

## Contexte

Réf : **P98.09** du fichier de pistes, `validé` (V2 accordé : des routes d'authentification
s'ouvrent pendant la fenêtre).

Décision du porteur : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

`MaintenanceService::shouldBlock()` n'exemptait que `api/maintenance/status` et `api/admin*`. En
`down`, `POST api/auth/login` et `GET api/auth/me` rendaient 503 ; la console, qui lit
`/auth/me` avant de se rendre, ne se chargeait pas, contrairement à TCK-218 (« un super-admin garde
l'accès en `down` »). En `read_only`, personne n'ouvrait de session.

## Objectif utilisateur

Pendant une fenêtre de maintenance, l'opérateur se connecte et charge la console pour la lever.

## Delta à produire

- [x] `MaintenanceService::shouldBlock()` exempte `POST api/auth/login` et `GET api/auth/me`.
- [x] Test par mode dans `MaintenanceModeTest`.

## Critères d'acceptation

- [x] AC1 — en `down` et en `read_only`, la connexion d'un super-admin rend 200 (jeton ou demande
      du second facteur), et `GET /api/auth/me` rend 200.
- [x] AC2 — en `down`, le reste de l'API (`GET /api/properties`) rend toujours 503.

## Hors périmètre

- `api/auth/logout` et le reste d'`api/auth/*` (reste) : la piste demande « au moins la connexion
  et `me` », la voie la plus étroite s'arrête là. Une déconnexion en `read_only` rend toujours 503.
- Réserver l'exemption à la session d'un opérateur : la connexion ne sait pas qui se connecte avant
  le mot de passe ; un utilisateur non opérateur connecté en `down` reçoit 503 partout ailleurs.

## Notes d'implémentation

- Choix : exempter la connexion et `GET /auth/me` pour tous, la plus étroite des voies de la piste
  qui rende la console à l'opérateur (TCK-218). L'exemption se juge sur le couple méthode + chemin.
- Le second facteur passe par la même route `login` (`two_factor_code`) : il n'y a pas d'autre
  route à exempter pour qu'un super-admin se connecte.
- Ablation : `MaintenanceService.php` rendu à `pre-dev` → 1 rouge sur 6 (503 à la connexion en
  `down`) ; correctif remis → 6/6. `MaintenancePriorityTest` vert.
