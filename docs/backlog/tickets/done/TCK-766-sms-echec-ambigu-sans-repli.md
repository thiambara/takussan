---
id: TCK-766
title: "SMS et WhatsApp : un échec ambigu (délai dépassé, 5xx) ne passe pas au fournisseur suivant, sauf pour un code"
status: done
phase: P2
family: back
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-27--routeur-sms--double-envoi-sur-un-timeout-suivi-dun-repli"
tags: [back, sms, whatsapp, notifications, pistes]
---

## Contexte

Réf : **P27.02** du fichier de pistes, `validé` par le porteur (critère accordé : V7, qui renverse
le « timeout → fallback immédiat » de TCK-102:82).

Chaque pilote SMS range toute exception HTTP et toute réponse non réussie en `failed`, et le
routeur passe tout `failed` au pilote suivant. Mesuré par le mesureur : Orange qui lève
« cURL error 28 », ou qui répond 502, fait partir le SMS par LAfricaMobile. Si Orange avait
accepté avant la coupure, le destinataire reçoit deux SMS, payés deux fois. Même schéma de
WhatsApp vers le SMS.

## Décision du porteur

un échec ambigu (délai dépassé, 5xx) ne passe pas au fournisseur suivant ; les codes OTP gardent le repli

## Objectif utilisateur

Un destinataire ne reçoit pas deux fois la même notification parce qu'un fournisseur a tardé à
répondre ; un code à usage unique, lui, arrive toujours.

## Contraintes strictes

- **Ambigu** : `ConnectionException` de délai dépassé (cURL 28), ou réponse 5xx
  (`App\Services\Notifications\Sms\AmbiguousDelivery`). **Sûr** : connexion refusée, hôte
  introuvable, 4xx ; ceux-là se replient comme avant.
- **Codes à usage unique** : le contexte d'envoi porte `is_otp`, posé par
  `PhoneVerificationService`, `DeletionStepUpService` et `LeaseSignatureCodeNotification`
  (`isOtpSms()`, lu par `SmsChannel`). Le routeur garde alors le repli.
- WhatsApp → SMS : le repli ne part que sur un échec sûr (features.md § 2.3 : « échoue
  durement »).
- Le statut écrit reste `failed`, sans valeur neuve en base : le drapeau `ambiguous` du résultat
  ne décide que du repli.

## Delta à produire

- [x] `AmbiguousDelivery` ; drapeau `ambiguous` sur `SmsResult` et `WhatsappResult`.
- [x] Pilotes Orange, LAfricaMobile, Mtarget et WhatsApp Cloud : le drapeau sur l'exception et le 5xx.
- [x] `SmsRouterDriver::walkChain()` : un échec ambigu clôt la chaîne du numéro, sauf `is_otp` ;
      une exception levée par un pilote est classée de même.
- [x] `WhatsappChannel` : pas de repli SMS sur un échec ambigu.
- [x] `is_otp` aux trois envois de code.
- [x] Tests : `AmbiguousSmsFailureTest` (8), deux cas dans `WhatsappChannelTest`.

## Critères d'acceptation

- [x] AC1 — Orange en délai dépassé ou en 502 : résultat `orange` `failed`, LAfricaMobile jamais appelé.
- [x] AC2 — Orange en connexion refusée ou en 400 : repli sur LAfricaMobile.
- [x] AC3 — LAfricaMobile en délai dépassé, Mtarget en 503 : pas de pilote suivant.
- [x] AC4 — Un envoi `is_otp` garde le repli sur un échec ambigu.
- [x] AC5 — WhatsApp en 503 ou en délai dépassé : aucun SMS.
- [x] AC6 — Les trois envois de code posent `is_otp`.

## Hors périmètre

- Statut `unknown` réconcilié par l'accusé de réception ou le puller : une tentative coupée n'a pas
  d'identifiant fournisseur, il n'y aurait rien à réconcilier.
- Plafond Orange de 3 SMS par jour sur un échec ambigu (non incrémenté, comme avant).
- Erreurs cURL après envoi autres que le délai (52, 56) : la décision ne nomme que le délai et le 5xx.
- Le renvoi Orange après 401 hors `try` (P27.05) : son exception est désormais classée par le routeur.

## Notes d'implémentation

- **Ablation** : routeur et `WhatsappChannel` remis → 6 rouges (AC1, AC3, AC5) ; drapeaux `is_otp`
  retirés → 1 rouge (AC6). Correctif remis : verts.
- Quatre tests existants prenaient un 500 pour un échec dur (`SmsRouterDriverTest`
  `test_orange_failure_falls_back_to_lam_then_mtarget`, trois de `WhatsappChannelTest`) : ils
  rougissaient sous la décision, et passent en 400, ce qui garde leur intention (un refus se replie).
- `Http::fake()` garde le premier faux qui correspond : un test ne peut pas changer la réponse
  d'un même hôte en cours de route, d'où un cas par test.
