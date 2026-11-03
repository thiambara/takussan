---
id: TCK-1092
title: "Un `failed` WhatsApp reçu après l'acceptation met en file le SMS de la même notification, une seule fois"
status: done
phase: P2
family: bug
estimate: M
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-failed-whatsapp-reçu-après-lacceptation-ne-déclenche-aucun-repli-sms"
tags: [back, notifications, whatsapp, sms, pistes]
---

## Objectif utilisateur

Un destinataire dont le message WhatsApp n'est finalement pas arrivé (Meta l'a accepté, puis l'a
dit `failed`) reçoit le même message par SMS, une fois, s'il est encore temps.

## Contexte

Réf : **P72.01** du fichier de pistes, `validé` (critère V7 accordé).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `fc25d5ff5` + TCK-1091) : tentative
`whatsapp_cloud` à `sent` rattachée à une notification par code, accusé
`UpdateWhatsappDeliveryStatusJob('wamid.X', 'failed', …)` → la tentative passe à `failed`, aucun
SMS. `WhatsappChannel::send()` ne se replie que sur l'échec rendu par l'appel lui-même.

## Décision du porteur

> sur un `failed` tardif d'une tentative `whatsapp_cloud`, mettre en file le SMS de la même notification, une seule fois (aucune tentative SMS déjà écrite pour elle), seulement si `smsFallbackAllowed`, hors des heures calmes ARTP, et seulement si l'accusé arrive moins d'une heure après l'envoi ; préciser dans `features.md` (en session) qu'un `failed` de Meta est un échec dur ; test : l'accusé rejoué deux fois, un seul SMS (porteur, 2026-10-20)

## Hypothèses (mode sans humain)

- « Une seule fois » tient par deux verrous : le job n'est mis en file qu'au **passage** de la
  tentative à `failed` (`DeliveryAttemptUpdater`, sous `lockForUpdate`, compare le statut ; un
  accusé rejoué ne repasse pas), et il ne part pas si une tentative non WhatsApp existe déjà pour la
  notification.
- « Hors des heures calmes ARTP » se lit comme une condition : pendant les heures calmes
  (`QuietHoursGuard`, 22 h – 6 h à Dakar), le SMS ne part pas, et il n'est pas reporté au matin
  (le délai d'une heure le rendrait de toute façon hors d'objet).
- « Moins d'une heure après l'envoi » : l'heure de réception de l'accusé (prise quand le job
  d'accusé l'applique) moins `sent_at` de la tentative (`created_at` à défaut), au plus 3600 s.
- Seules les notifications par code portent une ligne `app_notifications` sur leurs tentatives
  (`CodedNotification::appNotificationIdFor()`, seul implémenteur) : le SMS se rend depuis cette
  ligne (code, paramètres, cible) dans la langue du destinataire, comme `toSms()`. Un contact sans
  compte n'a pas de ligne : rien ne part pour lui.
- `CodedNotification` ne déclare pas `smsFallbackAllowed()` : le repli lui est donc permis. Le
  contrôle reste dans le job (`method_exists`, comme `WhatsappChannel::fallbackToSms()`), sans test
  propre faute de notification par code qui le refuse.
- Le SMS part avec le contexte de `WhatsappChannel` : `is_critical` faux, l'événement de
  préférence, l'agence de l'utilisateur, l'identifiant de la ligne (le routeur y rattache sa
  tentative).

## Delta à produire

- [x] `DeliveryAttemptUpdater::applyStatus()` : paramètre `onLateFailure`, appelé après la
  transaction au seul passage à `failed`.
- [x] `UpdateWhatsappDeliveryStatusJob` : met en file `SendSmsAfterLateWhatsappFailureJob`.
- [x] `SendSmsAfterLateWhatsappFailureJob` : les conditions ci-dessus, puis `SmsRouterDriver::send()`.
- [x] Test : `LateWhatsappFailureSmsFallbackTest` (5).

## Critères d'acceptation

- [x] AC1 — l'accusé `failed` rejoué deux fois → un seul SMS, rattaché à la notification, avec son texte.
- [x] AC2 — une tentative SMS déjà écrite pour la notification → aucun SMS.
- [x] AC3 — accusé 61 minutes après l'envoi → aucun SMS.
- [x] AC4 — accusé à 23 h à Dakar → aucun SMS.
- [x] AC5 — accusé `delivered` → aucun SMS.

## Reste à faire

préciser dans `features.md` (en session) qu'un `failed` de Meta est un échec dur — `docs/features.md`
est fermé à l'implémenteur.

## Hors périmètre

- La phrase de `features.md` (en session, porteur).
- Le routage suivant après un échec tardif (P72.03) et le renvoi des codes (P72.04).

## Notes d'implémentation

- Ablation : `UpdateWhatsappDeliveryStatusJob` remis à son état d'avant (sans `onLateFailure`) →
  1 rouge sur 5 (AC1, aucun SMS) ; les quatre autres sont des cas « rien ne part », verts par
  construction sans le correctif, et gardent le correctif contre un envoi de trop.
- Les tests figent l'heure à midi à Dakar : sans cela, un passage lancé la nuit tombe dans les
  heures calmes et AC1 rougit sans défaut.
