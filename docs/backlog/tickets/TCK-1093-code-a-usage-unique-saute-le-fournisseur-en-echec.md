---
id: TCK-1093
title: "Le renvoi d'un code à usage unique saute, 15 minutes, le fournisseur dont l'accusé est revenu `failed`"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: [TCK-1091]
blocks: []
spec_refs:
  features:
    - "docs/features.md#canal-whatsapp-sortant-livré--tck-282--activé-par-défaut-par-tck-588"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-échec-tardif-ne-change-aucun-routage-suivant"
tags: [back, notifications, sms, otp, pistes]
---

## Objectif utilisateur

Quelqu'un qui n'a pas reçu son code (le fournisseur l'a accepté, puis l'a dit `failed`) et le
redemande le reçoit par un autre fournisseur, au lieu de retomber sur celui qui vient d'échouer.

## Contexte

Réf : **P72.03** du fichier de pistes, `validé` (critères V7 et V6 accordés).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `fc25d5ff5` + TCK-1091, TCK-1092) :
code envoyé à un numéro Orange (`is_otp`), accepté par `orange`, accusé `failed` appliqué par
`DeliveryAttemptUpdater` ; le renvoi repart par `orange`. `SmsRouterDriver::resolveChain()` relit
la chaîne telle quelle à chaque envoi.

## Décision du porteur

> pour les seuls codes à usage unique (`is_otp`), retenir en cache, par numéro et pendant 15 minutes, le fournisseur (ou WhatsApp) dont l'accusé est revenu `failed`, et le sauter au renvoi ; aucune colonne neuve ; test : un `failed` tardif, puis un renvoi qui part par le fournisseur suivant (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- La tentative ne dit pas qu'elle portait un code (c'est P72.04). Sans colonne, le routeur retient
  lui-même en cache, à l'acceptation d'un code, `(fournisseur, identifiant de message) → numéro`,
  15 minutes ; l'accusé `failed` retrouve ainsi le numéro et y inscrit le fournisseur, 15 minutes.
- « (ou WhatsApp) » : aucun code ne part par WhatsApp. Les trois codes passent par le routeur SMS
  (`PhoneVerificationService`, `DeletionStepUpService` en direct, `LeaseSignatureCodeNotification`
  par `SmsChannel`) : il n'y a rien à retenir pour WhatsApp, et rien n'est écrit pour lui.
- Si tous les fournisseurs de la chaîne du numéro sont inscrits, aucun n'est sauté : mieux vaut
  retenter un fournisseur qui a échoué que ne rien envoyer.
- Un fournisseur sauté n'écrit aucune tentative : il n'a pas été appelé.

## Delta à produire

- [x] `OtpLateFailureMemory` (cache, 15 min) : `rememberSent()`, `recordFailure()`, `failedProviders()`.
- [x] `SmsRouterDriver::walkChain()` : retient les codes acceptés, saute les fournisseurs inscrits.
- [x] `DeliveryAttemptUpdater` : au passage à `failed`, `recordFailure()`.
- [x] Test : `OtpLateFailureRoutingTest` (4).

## Critères d'acceptation

- [x] AC1 — code accepté par `orange`, accusé `failed`, renvoi → part par `lafricamobile` ; une
  seule tentative `orange`.
- [x] AC2 — un SMS qui n'est pas un code, même en échec, ne change pas la chaîne du code suivant.
- [x] AC3 — 16 minutes plus tard, le code repart par `orange`.
- [x] AC4 — toute la chaîne en échec → elle est rejouée entière (`orange`).

## Hors périmètre

- Les SMS qui ne sont pas des codes, et les messages WhatsApp (décision : codes seuls).
- Le signal et le renvoi immédiat d'un code perdu (P72.04).

## Notes d'implémentation

- Ablation : l'appel à `recordFailure()` retiré de `DeliveryAttemptUpdater` → 2 rouges sur 4 (AC1,
  AC4) ; correctif remis → 4 verts.
- Le routeur reçoit la mémoire par un paramètre de constructeur à valeur par défaut :
  `AppServiceProvider` le construit argument par argument et n'a pas eu à changer.
