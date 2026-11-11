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

Re-mesure du 2026-11-11 sur `693cb3b42` (branche `feat/audit-ux-app-lot-1`) :

- **Prémisse confirmée** : un compte connecté sans e-mail qui accepte une invitation par e-mail crée un second compte (`InvitationAcceptConnectedNoDuplicateTest`, rouge avant le correctif : 3 comptes au lieu de 2).
- **`verify` porte aussi `phone`** pour une invitation par e-mail (le numéro saisi à l'envoi) : la liste des champs du ticket l'omettait. Requis par e-mail, ignoré par SMS, comme à `code`. TCK-2611 l'envoie.
- **`terms_version` est relayé** comme à `auth/phone/verify-code` : sans lui, un compte désigné par le Radar (TCK-2404) restait sur `requires_terms` sans pouvoir accepter.
- **« Verrou après 5 codes faux »** ne décrit pas le code : 5 codes faux **invalident le code** (`MAX_ATTEMPTS_PER_CODE`, 422 même avec le bon) ; le **verrou** (423) vient à `LoginLock::MAX_FAILURES` = 10 ; le limiteur `auth-phone-verify` rend 429 à la 5ᵉ requête de 15 min. Le test épingle ces trois comportements tels qu'ils sont.
- **Limiteur** : `phoneRateLimitKey()` lisait le seul `phone` du corps ; une vérification d'invitation par SMS n'en porte pas, et toutes seraient tombées dans **un seau commun** de 4 par 15 min. Branche ajoutée (comme `radar.claims.confirm`) : numéro de l'invitation lu par le jeton, numéro saisi par e-mail, seau haché pour un jeton inconnu.
- **L'état du jeton prime la validation** : `SendInvitationCodeRequest` résout l'invitation dans `prepareForValidation` (404/410 avant un 422 de corps incomplet), après le drapeau (404).
- **Transaction** : `authenticate()` puis l'acceptation dans une seule transaction (`InvitationCodeAcceptance`) ; un refus (401/403/409/410) défait le compte créé et la session émise. Le compte E ne se juge qu'**après** le code (avant, la réponse dirait si un numéro saisi est celui de E). Le code, lui, est consommé (cache) : après un 401, l'invité redemande un code.
- **Le 401 `requires_login`** porte `requires_login` et `email` en clair, comme `POST …/accept` aujourd'hui : il ne sort qu'après un code juste.
- **Correctif de la branche connectée d'`accept()`** (`acceptForAccount`) : par SMS, la comparaison du numéro passe par `CanonicalPhone::fold` (et non l'égalité stricte d'`acceptForAuthenticatedUser`). Effet de bord voulu par ADR-0094 § 7 : un appelant connecté à un **autre** compte que le destinataire, sans compte E, reçoit 403 `email_mismatch` / `phone_mismatch` au lieu de voir naître un compte pour l'invité. Cinq classes de test acceptaient sous la session de l'invitant (ou d'un tiers) et ont reçu un `forgetGuards()` ; `InvitationAcceptTest::test_authenticated_user_with_mismatched_email_is_rejected` assertait le défaut (200) sous un titre « rejected » : il asserte désormais 403.
- **Langue d'un compte né par code** : `metadata.locale` de l'invitation, comme TCK-1344 pour la voie mot de passe.
- `ProtectedActions::EXEMPT` : les deux routes, comme `InvitationAcceptController` (le second facteur d'un compte existant est exigé par la vérification elle-même).
