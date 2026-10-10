---
id: TCK-622
title: "« Trop de tentatives » sur un parcours ordinaire : la borne SMS par numéro comptait les requêtes et non les codes envoyés, et le front écrasait tout 429 sous le même message"
status: doing
phase: P1
family: full
estimate: S
wave: null
created: 2026-10-10
updated: 2026-10-10
depends_on: [TCK-589, TCK-620]
blocks: []
spec_refs:
  features:
    - docs/features.md#21-authentification--comptes
  models: []
tags: [back, front, auth, telephone, sms, otp, rate-limit, erreurs]
---

## Objectif utilisateur

- **Tout utilisateur qui vérifie un numéro** (connexion, inscription, onboarding, profil, changement
  de numéro) : n'être bloqué que s'il a VRAIMENT reçu trop de codes, et savoir alors combien de
  temps attendre.

## Contexte

Relevé en préproduction le 2026-10-10 sur le numéro du porteur : deux codes partis à 13:40 et 13:42,
puis le toast « Envoi du code impossible — Trop de tentatives. Réessayez dans quelques minutes. »
vers 13:50, sur un parcours sans rien d'exceptionnel (connexion par téléphone, puis onboarding).
Le compteur par IP était à 4/20 : l'IP est bien résolue, ce n'est pas l'infra.

Trois défauts qui se cumulent :

1. **La borne par numéro était un limiteur de route** (`throttle:auth-phone-send`, 3/15 min et
   5/24 h), donc jugée AVANT le contrôleur : un clic refusé par le délai de renvoi de 60 s, une
   saisie invalide, une réponse neutre coûtaient une place. Deux envois réels plus un clic de trop
   fermaient le numéro un quart d'heure.
2. **Le seau est commun** à la connexion, aux onboardings, au profil et au code de preuve : le
   parcours connexion → onboarding le vide à lui seul.
3. **Le front rendait tout 429 en « Trop de tentatives »** (`ApiError.codeErreur`, règle « 429
   d'abord »), y compris `phone.resend_too_soon`, qui portait pourtant un message précis.

## Décision

- **`App\Services\Auth\PhoneSendQuota`** porte la borne par numéro, **par code envoyé** :
  `ensureAvailable()` avant l'envoi (429 `phone.send_limit` / `phone.send_limit_day`, avec
  `retry_after` et `Retry-After`), `hit()` après. Une réponse neutre (numéro vérifié ailleurs) et
  un numéro verrouillé comptent comme un envoi, délai de renvoi compris : la borne ne dit rien de
  plus que l'envoi.
- Le limiteur de route `auth-phone-send` ne garde que la borne **par IP** (20/h, toutes requêtes).
- **Hors production, là où le code s'affiche** (`OtpPreview::enabled()`, ADR-0060) : 20/15 min et
  60/24 h.
- **Le délai de renvoi dit ce qui reste** : 429 `phone.resend_too_soon` porte `retry_after` et son
  message « dans :seconds s » ; `request-code` rend le vrai délai restant ; un envoi réussi rend
  `retry_after`.
- **Tout 429 générique du limiteur** porte `retry_after` dans le corps (l'en-tête ne traverse pas
  les actions serveur du front).
- **Front** : un 429 codé par l'application affiche sa prose ; le 429 générique avec délai affiche
  « Réessayez dans N min » (`errors.api.tooManyRequestsIn`).
- ADR-0033 §6 amendé.

## Critères d'acceptation

- [x] Un clic refusé par le délai de renvoi ne consomme aucune place : trois codes réels passent
      après deux clics trop tôt (rouge sous l'ancien limiteur, ablation).
- [x] Le quatrième code réel en un quart d'heure rend 429 `phone.send_limit` avec `retry_after`.
- [x] Un numéro verrouillé et un numéro libre rendent la même séquence de statuts ; la réponse
      neutre compte comme un envoi.
- [x] Le même numéro écrit avec ou sans espaces partage sa borne.
- [x] Le front affiche « Un code vient de partir. Vous pourrez en demander un autre dans 42 s. »
      au lieu de « Trop de tentatives » (rouge sans le correctif, ablation).

## Hors périmètre

- Un compte à rebours sur le bouton « Renvoyer » des assistants d'onboarding et du profil : ils
  reçoivent désormais `retry_after`, mais leur écran est revu par la refonte du parcours
  connexion → publication.

## Vérification

- `tests/Feature/Auth/Phone/PhoneSendQuotaTest.php` (8 tests, 7 rouges sous l'ancien code).
- `tests/Feature/Auth`, `tests/Feature/Onboarding`, `tests/Unit/Lang`, `tests/Unit/Architecture`,
  `LeaseSignatureTest`, `tests/Feature/Http`, `tests/Feature/Middleware` : verts.
- `src/lib/__tests__/api-erreurs-bff.test.tsx` : trois cas 429 (deux rouges sans le correctif).
