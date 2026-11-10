---
id: TCK-2610
title: "Accepter une invitation par code SMS : le compte naît, ou s'ouvre, et l'invitation est acceptée en un envoi"
status: todo
phase: P1
family: back
estimate: M
wave: 86
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2611]
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
    - "docs/features.md#21-authentification--comptes"
  models:
    - "docs/models-spec.md#48-invitation-"
    - "docs/models-spec.md#1-user"
tags: [back, invitation, auth, phone, audit-ux, app]
---

## Objectif utilisateur

L'invité entre comme on entre partout dans Takussan — un numéro, un code — sans inventer de mot de passe, et arrive dans l'assistant de son rôle avec son compte vérifié.

## Contrat de données

Re-mesure sur `dev` (1bce3798a), `InvitationService` :

- `accept()` sans session crée un compte (mot de passe aléatoire si absent) ; une invitation **par SMS** crée un compte au numéro déjà vérifié (`markVerified`).
- `acceptForAuthenticatedUser()` refuse un compte dont l'e-mail diffère (403 `invitation.email_mismatch`) ou, pour une invitation par numéro, dont le numéro vérifié diffère (403 `invitation.phone_mismatch`).
- **Défaut relevé** : un compte connecté par téléphone (sans e-mail) qui accepte une invitation **par e-mail** passe par `accept()` ; aucun compte ne porte l'e-mail, donc `acceptAsNewUser` crée un **second** compte au lieu de rattacher le profil au compte connecté.

**À créer** (décision 3 a du porteur) :

- `POST /api/public/invitations/{token}/code` → `InvitationCodeController@send`, `SendInvitationCodeRequest` : invitation par SMS → le code part au numéro de l'invitation (le corps n'en porte pas) ; invitation par e-mail → `phone` requis (E.164, indicatif autorisé). Mêmes limiteurs et verrou que `auth/phone/request-code` (`auth-phone-send`, `PhoneLoginService::SCOPE`) ; 202 et `retry_after` ; code d'aperçu hors production (ADR-0060).
- `POST /api/public/invitations/{token}/verify` → `InvitationCodeController@verify`, `VerifyInvitationCodeRequest` (`code`, `first_name`, `last_name`, `two_factor_code` | `recovery_code`, `device_name`) : vérifie le code par `PhoneLoginService` (même verrou, mêmes 423 / 429), puis :
  - compte A = celui dont le numéro vérifié est ce numéro ; compte E = celui qui porte l'e-mail de l'invitation ;
  - E existe et A ≠ E → 401 `invitation.requires_login` (comme aujourd'hui) ;
  - A existe → acceptation pour A (règles d'`acceptForAuthenticatedUser`) ; si A n'a pas d'e-mail et que l'invitation en porte un, l'e-mail est posé et vérifié (le lien est parvenu à cette adresse) ;
  - A n'existe pas → compte créé au numéro vérifié, à l'e-mail de l'invitation s'il y en a un, au prénom et au nom envoyés, puis acceptation ;
  - second facteur actif sur A → `requires_2fa`, code non consommé (comme la connexion par téléphone) ;
  - réponse : celle de `auth/phone/verify-code` (`token`, `user`, `expires_at`, `is_new_account`) + `invitation` (`InvitationResource`).
- `InvitationService::accept()` : un appelant **connecté** n'est jamais doublé d'un nouveau compte — sans compte E, l'acceptation se fait pour lui (règles d'`acceptForAuthenticatedUser`, e-mail posé s'il n'en a pas).

## Direction UX / Artistique

Sans objet : ticket back. L'écran qui consomme ce contrat est dit dans « Hors périmètre ».

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0094](../../../adr/0094-l-invitation-se-lit-avant-d-entrer-et-s-accepte-par-code.md).
- La voie mot de passe reste entière : `POST /api/invitations/{token}/accept` avec `first_name`, `last_name`, `password` garde sa réponse.
- Les deux routes suivent le drapeau `auth.phone_login.enabled` (ADR-0033) comme `auth/phone/*` : **404 drapeau éteint**. Le correctif de la branche connectée d'`accept()` vaut, lui, drapeau éteint ou allumé.
- Prénom et nom ne s'écrivent que sur un compte qui n'en a pas (règle de TCK-2281).
- Le profil devient actif et `active` comme à l'acceptation d'aujourd'hui (`finalizeAccept`) ; les biens en attente passent au bailleur (TCK-1000).
- Aucune énumération : `code` rend la même réponse qu'un compte existe ou non pour ce numéro.
- Un numéro vérifié n'appartient qu'à un compte (TCK-589) : 409 si le numéro saisi est vérifié ailleurs que sur A (cas impossible par construction, gardé).

## Delta à produire

- [ ] Routes publiques dans `routes/api/invitations.php`.
- [ ] `InvitationCodeController`, `SendInvitationCodeRequest`, `VerifyInvitationCodeRequest`.
- [ ] `InvitationService` : `acceptByVerifiedPhone(Invitation, User|array)` ; correctif de la branche connectée d'`accept()`.
- [ ] Tests : `InvitationAcceptByCodeTest` — SMS, nouveau compte (vérifié, profil actif) ; e-mail, nouveau compte (e-mail vérifié + numéro vérifié) ; numéro d'un compte existant sans e-mail → profil rattaché, e-mail posé ; e-mail d'un autre compte → 401 `requires_login` ; second facteur → `requires_2fa` ; verrou après 5 codes faux ; `InvitationAcceptConnectedNoDuplicateTest` — compte connecté sans e-mail accepte une invitation par e-mail → un seul compte.

## Critères d'acceptation

- [ ] AC1 — Invitation par SMS au 77 123 45 67 : `code` puis `verify` (code juste, « Moussa » / « Ndiaye ») rend un jeton ; le compte a le numéro vérifié, le profil bailleur `active` et actif, les 3 biens en attente lui appartiennent.
- [ ] AC2 — Compte né par téléphone, sans e-mail, connecté, accepte une invitation adressée à m@exemple.sn : le nombre de lignes de `users` ne change pas (rouge sur `dev` : il augmente de 1), le profil est sur ce compte et son e-mail vaut m@exemple.sn, vérifié.
- [ ] AC3 — L'e-mail de l'invitation appartient au compte X, le code est vérifié pour le numéro du compte Y : 401 `invitation.requires_login`, rien n'est accepté.
- [ ] AC4 — Les réponses de `code` pour un numéro avec et sans compte sont identiques.

## Hors périmètre

- La page (TCK-2611) ; l'aperçu (TCK-2609).

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
