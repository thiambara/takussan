---
id: TCK-2161
title: "Les SMS et les WhatsApp partent par l'intégration de l'agence de l'objet notifié, que le destinataire ait un compte ou non"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#canal-whatsapp-sortant-livré--tck-282--activé-par-défaut-par-tck-588"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-203--agence-dun-compte-lue-hors-requête-http"
tags: [api, sms, whatsapp, notifications, integrations, pistes]
---

## Objectif utilisateur

Le locataire, le visiteur ou le client reçoit le SMS ou le WhatsApp d'un bail, d'une visite ou
d'une fiche par l'émetteur de l'agence qui en a la charge, et non par celui de l'agence de son
propre profil, ni par celui de la plateforme parce qu'il n'a pas de compte.

## Contexte

Réfs : **P203.01** et **P203.02** du fichier de pistes, `validé`, même ticket. `SmsChannel` et
`WhatsappChannel` passaient au routeur `agency_id` = `$notifiable->agency_id` : au worker, sans
profil actif, l'agence du seul profil du compte (sinon `null`), et `null` pour tout contact sans
compte (`AnonymousNotifiable`), donc l'intégration de la plateforme.

## Décision du porteur

P203.01 :

> validation du porteur (2026-10-24) : l'agence d'un SMS ou d'un WhatsApp est celle de l'objet notifié, passée par chaque appelant de `send()` ; un appelant qui ne la passe pas garde l'accesseur actuel jusqu'à sa migration ; la règle est écrite à `docs/features.md`, § Canal WhatsApp sortant, « Émetteur »

P203.02 :

> validation du porteur (2026-10-24) : même règle que P203.01 pour le contact sans compte : `ContactSansCompte` porte l'agence de l'objet et les canaux la lisent sur la route ; même ticket que P203.01

## Hypothèses (mode sans humain)

- Ordre de résolution, écrit une fois (`AgenceDeLEnvoi::resolve()`) : l'agence passée par
  l'appelant (`CodedNotification::$agencyId`), sinon la route `agency` d'un contact sans compte,
  sinon l'accesseur du destinataire.
- `ContactSansCompte` porte l'agence de la fiche (`fromCustomer`) ou du bien de la visite
  (`fromVisit`) ; le relais mobile d'un compte la garde ; `fromLead` (e-mail seul),
  `fromInvitation` et `forPhone` n'en portent pas. La route `agency` n'est posée que pour un
  contact qui a un numéro (aucun canal mobile sinon).
- Appelants migrés dans ce ticket : les relances de loyer (`SendLeasePaymentReminders` : le
  locataire avec ou sans compte, son relais, le bailleur — l'agence du bail), les rappels de visite
  (`SendPropertyVisitReminders`) et `VisitNotifier` (l'agence du bien). Le récapitulatif d'agent
  des retards agrège plusieurs baux : il garde l'accesseur.
- Pour une relance de bail à un contact sans compte, l'agence du bail l'emporte sur celle de la
  fiche.

## Reste à faire

- Passer l'agence de l'objet dans les autres appelants de `NotificationService::send()`
  (réservations, paiements, interventions, quittances, comptes rendus…) : d'ici leur migration, ils
  gardent l'accesseur, comme le prévoit la décision.

## Delta à produire

- [x] `AgenceDeLEnvoi`, lu par `SmsChannel` et `WhatsappChannel` (leur `resolveAgencyId` retiré).
- [x] `CodedNotification::$agencyId` ; `NotificationService::send(…, agencyId:)`.
- [x] `ContactSansCompte::$agencyId` et la route `agency` de `sendToContact()`.
- [x] Appelants des relances de loyer et des visites.

## Critères d'acceptation

- [x] AC1 — Agence passée par l'appelant : elle l'emporte sur l'accesseur du compte ; sans elle, l'accesseur.
- [x] AC2 — Contact sans compte : l'agence de sa route, sinon aucune (la plateforme).
- [x] AC3 — Fiche client d'une agence, contact sans compte : le routeur reçoit cette agence.
- [x] AC4 — Relance de loyer d'un bail de B à un client dont la fiche est de A : le routeur reçoit B.

## Notes d'implémentation

- Ablation : `resolve()` ramené à l'accesseur → 4 rouges ; agence du bail retirée de l'appel du job → 1 rouge (AC4) ; agence de la fiche retirée de la route → 1 rouge (AC3) ; remis → 4 verts.
- Le point 3 de P203.05 (journaliser l'agence et l'intégration sur la tentative) demande des colonnes : l'entrée est reclassée (V4).
