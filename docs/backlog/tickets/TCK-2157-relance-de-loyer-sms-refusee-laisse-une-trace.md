---
id: TCK-2157
title: "La relance de loyer d'un locataire sans compte que tous les fournisseurs SMS refusent laisse une activité d'exploitation rattachée à l'échéance"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-207--rappels-planifiés-par-code-marqués-à-la-mise-en-file-face-à-un-envoi-perdu"
tags: [api, leases, sms, notifications, ops, pistes]
---

## Objectif utilisateur

L'exploitation sait quelle relance de loyer est perdue quand le SMS d'un locataire sans compte
n'est accepté par aucun fournisseur : une activité `ops_critical_job_failed` est rattachée à
l'échéance, sans le numéro ni les paramètres. La relance reste « au plus une fois ».

## Contexte

Réf : **P207.01** du fichier de pistes, `validé`. `SendLeasePaymentReminders::claim()` pose la
marque du jalon avant l'envoi ; vers un `ContactSansCompte`, le routeur change tout refus en
`SmsResult::failed` sans lever : ni exception, ni `CodedNotification::failed()`, ni trace
rattachée à l'échéance (seule une ligne `notification_delivery_attempts` sans notification).

## Décision du porteur

> validation du porteur (2026-10-24) : la décision du délégué : « au plus une fois », comme TCK-740 ; quand le SMS d'une relance de loyer vers un locataire sans compte n'est accepté par aucun fournisseur (`failed`), l'activité alertable `ops_critical_job_failed` est écrite côté canal, rattachée à l'échéance, sans les paramètres ni le numéro ; un résultat ambigu n'écrit rien et ne renvoie jamais ; le contrat est écrit à `docs/features.md:190`

## Reste à faire

> la reprise de la relance perdue, et la trace du rappel de visite d'un visiteur sans compte

## Hypothèses (mode sans humain)

- « Accepté par aucun fournisseur » : le routeur a rendu au moins un résultat, et tous sont
  `failed` non ambigus. Un SMS que le canal n'a pas remis au routeur (numéro invalide, limite
  horaire) n'écrit rien : aucun fournisseur ne l'a refusé.
- Propriétés de l'activité : `job` (`CodedNotification`), `code`, `channel` (`sms`) et `reason`
  (`sms_refused_by_all_providers`) ; ni numéro, ni paramètres, ni montant.
- L'objet voyage dans la notification par sa classe et sa clé, pas par le modèle : une copie en
  file ne doit pas échouer à la désérialisation si l'échéance disparaît d'ici là.
- Seule la branche « locataire sans compte » de `notifyTenant()` passe l'échéance ; le relais
  mobile d'un compte sans téléphone vérifié (TCK-1493) a sa cloche, et n'est pas visé.

## Delta à produire

- [x] `CodedNotification::$smsRefusalSubject` (classe et clé), `NotificationService::send(…, smsRefusalSubject:)` le passe pour un contact sans compte.
- [x] `SmsChannel::traceRefusal()` : activité `ops_critical_job_failed` rattachée à l'objet quand tous les résultats sont `failed` non ambigus.
- [x] `SendLeasePaymentReminders::notifyTenant()` passe l'échéance pour le locataire sans compte.

## Critères d'acceptation

- [x] AC1 — Refus de tous les fournisseurs : une activité sur l'échéance, code et canal, sans le numéro ni le montant.
- [x] AC2 — Le lendemain, dans la fenêtre de rattrapage, rien ne repart et aucune seconde activité.
- [x] AC3 — SMS accepté ou échec ambigu : aucune activité.

## Hors périmètre

- Un SMS de secours après un échec WhatsApp (`WhatsappChannel::fallbackToSms()`) passe par le routeur sans `SmsChannel` : non tracé ici (P207.02 porte le repli WhatsApp d'un contact sans compte).
- Un accusé `failed` tardif d'un SMS d'abord accepté (`DeliveryAttemptUpdater`) : non tracé.

## Notes d'implémentation

- Ablation : échéance retirée de l'appel du job → 1 rouge (AC1) ; ambigu compté comme refus → 1 rouge (AC3) ; remis → 3 verts.
