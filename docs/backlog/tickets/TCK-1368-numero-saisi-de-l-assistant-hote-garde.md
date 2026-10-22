---
id: TCK-1368
title: "Garder par un test le numéro saisi dans l'assistant hôte : écrit sur le compte, vérifié par code"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#le-numéro-saisi-à-létape-téléphone-de-lassistant-hôte-est-exigé-puis-ignoré"
tags: [back, onboarding, telephone, tests, pistes]
---

## Objectif utilisateur

Aucun changement visible : le parcours que le porteur a décidé pour le numéro de l'assistant hôte
— écrit sur le compte, vérifié par code, jamais marqué vérifié sans code — ne peut plus se défaire
sans qu'un test rougisse.

## Contexte

Réf : **P114.04** du fichier de pistes, `validé` (critère V2 cité par le classement, accordé).

Re-mesuré sur `45fd976b2` : la décision décrit le comportement en place, comme le mesureur
l'avait lu.

- L'assistant envoie le numéro saisi avec la demande de code (`phoneSendOtpAction(phone)` →
  `POST /api/auth/phone/send-otp`), et `PhoneVerificationController::resend()` l'écrit sur
  `users.phone` (sous `PhoneChangeGuard`) avant d'y envoyer le code.
- La soumission (`HostIndividualOnboardingService`) vérifie le code contre `users.phone`, donc
  contre le numéro saisi, et ne marque vérifié qu'après.
- Le champ est pré-rempli du numéro du compte (`HostIndividualWizard.tsx`, `phone_otp.phone`).

Rien ne gardait ce parcours de bout en bout : aucun test n'envoyait un numéro différent de celui
du compte.

## Décision du porteur

> porteur (2026-10-22) : le numéro saisi s'écrit sur le compte puis se vérifie par code (OTP), jamais marqué vérifié sans code ; pré-rempli s'il existe

## Hypothèses (mode sans humain)

- La décision ne demande pas de retirer `phone_otp.phone` de la soumission : le champ reste exigé,
  et toujours non lu par le service (le numéro fait foi par l'envoi du code). Noté en reste.
- Le pré-remplissage existe déjà et a ses tests (`HostIndividualWizard.test.tsx`, TCK-566).

## Reste à faire

- `phone_otp.phone`, exigé à la soumission de l'assistant hôte, n'est toujours lu par rien : le retirer, ou le comparer à `users.phone`, est à décider

## Delta à produire

- [x] Tests dans `HostIndividualOnboardingTest` : numéro saisi différent de celui du compte →
  écrit, code envoyé à lui seul, soumission avec ce code → vérifié ; mauvais code → 422, rien de
  vérifié.

## Critères d'acceptation

- [x] AC1 — compte au numéro A, envoi du code au numéro B : `users.phone` vaut B, aucun SMS vers A.
- [x] AC2 — soumission avec le code reçu par B : 201, `users.phone` B, `phone_verified_at` posé.
- [x] AC3 — soumission avec un mauvais code : 422, `phone_verified_at` reste nul.

## Hors périmètre

- Le code : inchangé, il fait déjà ce que la décision écrit.

## Notes d'implémentation

- Ablation : l'écriture du numéro dans `PhoneVerificationController::resend()` retirée → 2 rouges
  sur 2 (le code part à l'ancien numéro) ; remise → 2 verts, et 12 verts dans la classe.
