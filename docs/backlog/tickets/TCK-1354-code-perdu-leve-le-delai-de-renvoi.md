---
id: TCK-1354
title: "Un code à usage unique dit `failed` par son accusé lève le délai de renvoi de son sujet"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1093]
blocks: []
spec_refs:
  features:
    - "docs/features.md#canal-whatsapp-sortant-livré--tck-282--activé-par-défaut-par-tck-588"
  models:
    - "docs/models-spec.md#69-notificationdeliveryattempt-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-code-à-usage-unique-perdu-en-accusé-failed-ne-laisse-ni-signal-ni-autre-voie-au-destinataire"
tags: [back, notifications, sms, otp, pistes]
---

## Objectif utilisateur

Quelqu'un dont le code (vérification du téléphone, step-up de la suppression du compte, signature
de bail) a été accepté par le fournisseur puis dit `failed` peut en redemander un tout de suite, au
lieu d'attendre la fin d'un délai de renvoi posé pour un code qui n'arrivera pas.

## Contexte

Réf : **P72.04** du fichier de pistes, `validé` (critères V4 et V7 cités par les classements,
accordés ; la mesure du délégué y ajoutait V2, que la validation de « la piste telle qu'écrite »,
qui demande de lever le délai, couvre).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `45fd976b2`) : pour chacun des trois
envois, code accepté par `orange` par le vrai routeur, accusé `failed` appliqué par
`DeliveryAttemptUpdater` → le délai de renvoi du sujet court toujours (`canResend()` à `false`).
Rien ne relie l'accusé au délai : la tentative ne porte ni l'événement ni le sujet.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

## Choix de l'implémenteur

- **Le lien entre l'accusé et le sujet passe par le cache, pas par une colonne.** La piste
  propose d'écrire l'événement du code sur la tentative ; depuis, TCK-1093 retient déjà en cache,
  15 minutes, chaque code accepté (`fournisseur, identifiant de message → numéro`). L'envoi y
  ajoute la clé de cache du délai de renvoi de son sujet (`otp_resend_key` du contexte du routeur),
  et l'accusé `failed` la retire. C'est la voie la plus étroite : aucune migration, aucune
  donnée neuve hors du cache, et la mesure de l'implémenteur du 2026-10-21 montrait qu'une colonne
  d'événement seule ne suffisait pas (il faut le sujet).
- **Une fois par code** : l'entrée du code est consommée par le premier `failed` (`Cache::pull`),
  un accusé rejoué ne lève plus rien. Seul le délai de renvoi est levé : le plafond par numéro
  (`PhoneSendQuota`), le plafond du jour, le compteur d'essais, le verrou de signature et les
  limiteurs de route restent.
- **L'état « exposé »** est le délai levé lui-même : `resendAvailableIn()` / `canResend()` rendent
  `0` / `true`, et la demande de renvoi suivante passe. Aucune route neuve que l'écran relirait,
  ni changement de l'écran : laissés en reste (voir ci-dessous).
- **La bascule sur l'e-mail vérifié** (« voire » dans la piste) n'est pas faite : reste.

## Reste à faire

- une route que l'écran de saisie du code relit pour apprendre que le code est perdu (et l'écran qui la lit), et la bascule sur l'e-mail vérifié quand il existe

## Delta à produire

- [x] `OtpLateFailureMemory` : `rememberSent()` retient aussi la clé du délai de renvoi ;
  `recordFailure()` la retire (entrée ancienne, numéro seul, toujours lue).
- [x] `SmsRouterDriver` : passe `otp_resend_key` du contexte à la mémoire.
- [x] `PhoneVerificationService::deliver()`, `DeletionStepUpService::sendCode()` : `otp_resend_key`.
- [x] `LeaseSignatureOtpService::resendKey()`, `LeaseSignatureCodeNotification::otpResendKey()`,
  lu par `SmsChannel`.
- [x] Test : `OtpLateFailureResendTest` (6).

## Critères d'acceptation

- [x] AC1 — code de vérification du téléphone d'un compte, accusé `failed` → `canResend()` vrai,
  `resendAvailableIn()` à 0.
- [x] AC2 — code adressé à un numéro sans compte (`sendCodeTo`) → `canSendTo()` vrai.
- [x] AC3 — code du step-up de suppression par SMS → `canResend()` vrai.
- [x] AC4 — code de signature de bail par SMS (par `SmsChannel`) → `canResend()` vrai.
- [x] AC5 — un accusé `delivered` ne lève rien.
- [x] AC6 — l'accusé d'un code ne lève que le délai de son sujet, pas celui d'un autre numéro.

## Hors périmètre

- Le résultat ignoré de `$this->sms->send()` par le step-up de suppression (constat de P72.04,
  sans piste propre ici).

## Notes d'implémentation

- Ablation : `Cache::forget($resendKey)` retiré de `OtpLateFailureMemory::recordFailure()` →
  5 rouges sur 6 (AC5 reste vert, il garde le contraire) ; remis → 6 verts.
- Les trois délais vivent dans le magasin de cache par défaut, le même que la mémoire : la clé
  suffit, sans nommer de magasin.
