---
id: TCK-781
title: "L'activation du gérant provisionné : un e-mail « Activez votre compte » valable 7 jours, qui mène à /onboarding/agency-admin"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons"
tags: [back, front, auth, onboarding, pistes]
---

## Contexte

Réfs : **P15.07** et **P13.09** du fichier de pistes, toutes deux `validé`. Même cause et même
correctif : le gérant qu'un super-admin provisionne (`AgencyProvisioningService`) reçoit le gabarit
de réinitialisation de mot de passe (« vous avez demandé une réinitialisation… sinon ignorez »),
valable 60 minutes (`config/auth.php`, broker `users`), alors que TCK-209 promettait un e-mail
« Activez votre compte » valable 7 jours au plus. Après le mot de passe, la page de réinitialisation
renvoie vers `/auth/login`, si bien que `/onboarding/agency-admin`, que son docblock dit atteinte
par cette activation, n'a aucun lien (P13.09). Critère accordé : V2 (durée d'un lien d'activation)
et V7 (gabarit, texte neuf) pour P15.07 ; V7 (relier ou retirer la page) pour P13.09.

## Décision du porteur

P15.07 : gabarit « Activez votre compte » dédié, valable 7 jours (TCK-209), qui mène à /onboarding/agency-admin après le mot de passe ; le 409 d'un compte existant reste

P13.09 : relier la page depuis l'activation du gérant provisionné (P15.07)

## Delta à produire

- [x] `config/auth.php` : un broker `activations` (même fournisseur et même table), `expire` à
      10 080 minutes (7 jours).
- [x] `AgencyAdminActivationNotification` : gabarit « Activez votre compte » (fr, en ; en `wo`, le
      texte français tel quel), qui dit la durée en jours ; file urgente et chiffrée, comme les
      autres e-mails du compte ; lien `/auth/reset-password?token=…&email=…&activation=1`.
- [x] `AgencyProvisioningService::sendActivationLink` : jeton créé par le broker `activations`,
      envoi de la notification dédiée ; un échec d'envoi rend toujours 502 et annule tout.
- [x] `POST /api/auth/reset-password` : avec `activation=1`, le jeton est jugé par le broker
      `activations`, et seulement pour un compte qui n'a jamais choisi de mot de passe
      (`hasUsablePassword()` faux) ; sans lui, rien ne change (60 minutes).
- [x] Page `/auth/reset-password` : avec `activation=1`, la requête porte `activation`, et après
      le mot de passe la connexion redirige vers `/onboarding/agency-admin`.
- [x] Docblock de `/onboarding/agency-admin` ramené à ce qui y mène.

## Critères d'acceptation

- [x] AC1 — Le provisionnement envoie `AgencyAdminActivationNotification`, et non
      `ResetPasswordNotification` ; l'e-mail porte « Activez votre compte » et le lien
      `activation=1`.
- [x] AC2 — Le jeton d'activation est accepté 6 jours après l'envoi, refusé après 7 jours.
- [x] AC3 — Un jeton de réinitialisation ordinaire reste refusé après 60 minutes, même présenté
      avec `activation=1` par un compte qui a déjà choisi son mot de passe.
- [x] AC4 — Un e-mail déjà inscrit rend toujours 409 `agency.admin_email_taken`.
- [x] AC5 — Sur la page de réinitialisation ouverte avec `activation=1`, la réussite mène à
      `/auth/login?reset=1&redirect=%2Fonboarding%2Fagency-admin`.

## Hors périmètre

- Le rattachement d'un compte existant : le 409 reste (décision du porteur).
- Les autres envois du broker de réinitialisation (`UserSupportService`, mot de passe oublié).

## Hypothèses (mode sans humain)

- La connexion n'est pas ouverte par la réinitialisation (les jetons sont révoqués) : la page mène
  donc à la connexion, qui porte `redirect=/onboarding/agency-admin`, ce que la connexion sait déjà
  suivre (`avecRedirection`).
- Le broker `activations` partage la table `password_reset_tokens` : aucune migration. Un même
  e-mail n'y a qu'un jeton ; une demande de réinitialisation remplace donc le lien d'activation.

## Notes d'implémentation

- Ablation : les quatre fichiers d'API (broker, service, contrôleur, requête) remis à `pre-dev`
  → 4 rouges sur 10 (`AgencyAdminActivationTest` 3, `AgencyOnboardingTest` 1) ; remis → verts.
  La seule condition `hasUsablePassword()` du contrôleur retirée → 1 rouge (AC3) ; remise → vert.
  Côté front, le test du drapeau `activation` rougissait avant le correctif de la page.
- Piège : `toMail()` appelé hors de la file rend la langue de l'application, pas celle du
  destinataire ; le test fixe `fr` avant de lire le sujet.
- La notification rejoint `NotificationsDeCompteEnFileTest` (file urgente, chiffrée : elle porte
  un jeton).
