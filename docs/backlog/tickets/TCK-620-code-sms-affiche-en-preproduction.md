---
id: TCK-620
title: "En préproduction, aucun numéro ne se vérifie : le code part vers un fournisseur SMS absent et personne ne peut le lire — l'afficher dans l'écran où on le saisit, et allumer la connexion par téléphone"
status: done
phase: P1
family: full
estimate: M
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-589]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, front, auth, telephone, sms, otp, preproduction, adr-requise]
---

## Objectif utilisateur

- **Porteur, testeur** : en préproduction et en local, se connecter, s'inscrire, vérifier un numéro,
  finir un onboarding, prouver un changement de numéro, supprimer un compte sans e-mail et signer un
  bail **sans fournisseur SMS**, en lisant le code à côté du champ où on le saisit.

## Contexte

Relevé sur `dev` à `f271eebb` (2026-10-10).

- L'onglet Environment de `takussan-api-preview` (Dokploy) porte `APP_ENV=staging` et **aucune** clé
  `SMS_*` ni `PHONE_LOGIN_ENABLED` : la connexion par téléphone y est éteinte (404), et tout code
  part vers une chaîne de fournisseurs vide (`SmsRouterDriver`).
- Le code est pourtant rangé (`PhoneVerificationService::issue()` ne dépend pas de la remise). Il
  existe un code valide, et personne ne peut le lire : ADR-0033 §5 interdit de le rendre, dans tout
  environnement.
- Émetteurs de codes SMS dans une requête : `PhoneVerificationService::issue()` (connexion
  `request-code`, `send-otp` / `resend` des profils et des quatre onboardings, `change-code`),
  `DeletionStepUpService::sendCode()` (compte sans e-mail), `LeaseSignatureService::sendCode()`
  (signataire au numéro vérifié).

## Décision

[ADR-0060](../../adr/0060-code-sms-affiche-hors-production.md), qui amende ADR-0033 §1 et §5 hors
production.

## Critères d'acceptation

- [x] `OTP_PREVIEW_ENABLED=true` et `APP_ENV` ∈ {`local`, `staging`, `testing`} : la réponse de
  chaque émetteur ci-dessus porte `otp_preview`, et **ce code-là** est celui qui vérifie.
- [x] Drapeau éteint, ou `APP_ENV=production` drapeau allumé : aucune réponse ne porte
  `otp_preview`. Un test vérifie chacun des deux verrous **séparément**.
- [x] Un code parti par e-mail (suppression, signature) ne revient pas.
- [x] Le SMS est toujours tenté : le faux routeur des tests le reçoit, drapeau allumé.
- [x] Le front affiche le code reçu à côté du champ, dans chacun des neuf écrans : connexion,
  inscription, vérification du profil, preuve de changement de numéro, quatre onboardings, suppression
  de compte, signature de bail. Rien ne s'affiche sans `otp_preview`.
- [x] `.env.docker` : `PHONE_LOGIN_ENABLED=true`, `OTP_PREVIEW_ENABLED=true` ; `.env.example` : la
  clé vide ; `phpunit.xml` : `false`.
- [ ] Préproduction (mesuré après la fusion et la promotion) : les deux clés posées dans Dokploy, l'image déployée, et le parcours mesuré sur
  `https://preview.api.takussan.com` (`request-code` rend `otp_preview`, `verify-code` ouvre la
  session).

## Hors périmètre

- L'allumage en production : il reste soumis à un envoi réel mesuré (ADR-0033 §1).
- Les codes envoyés par e-mail, et ceux émis dans un job (alerte de recherche par WhatsApp).

## Vérification

- `OtpPreviewTest` (9) et `LeaseSignatureTest::test_the_sms_code_is_previewed_outside_production_and_signs`.
  Par ablation : sans `&& app()->environment(...)` dans `OtpPreview::enabled()`, le test « drapeau
  allumé en production » rougit ; sans `record()` dans `PhoneVerificationService::issue()`, quatre
  tests rougissent.
- Front : `connexion-par-telephone.test.tsx` (le code s'affiche et remplit le champ ; absent sans
  `otp_preview`), `lib/__tests__/otp-preview.test.ts`.
- `phpunit.xml` force désormais `PHONE_LOGIN_ENABLED=false` : `.env.docker` l'allume, et deux
  tests (`PhoneLoginFlagTest`, `SmsOtpRelayTest`) en héritaient.
