---
id: TCK-1795
title: "Alerte de recherche par WhatsApp à un abonné sans compte : un échec sûr du fournisseur rend la réservation de la fenêtre"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-179--trycatch-autour-dun-envoi-en-file-qui-promettent-un-repli"
tags: [api, notifications, whatsapp, alertes-recherche, pistes]
---

## Contexte

Réf : **P179.02** du fichier de pistes, `retenu · autonome` (A1).

`SendSavedSearchAlerts` réserve la fenêtre (`last_notified_at` avancé à la borne) avant l'envoi,
et son `catch` la rend si `notify()` lève : « un envoi qui échoue rend la réservation ». Pour un
abonné sans compte confirmé au canal WhatsApp, ce canal est le seul (`via()`), sans repli SMS
(`smsFallbackAllowed()` → `false`). Or `WhatsappChannel` ne lève jamais : un pilote qui échoue rend
un `WhatsappResult`. La réservation reste, et les biens de la fenêtre ne sont plus jamais annoncés.

## Hypothèses (mode sans humain)

- Seul un échec **sûr** du fournisseur (`STATUS_FAILED`, non ambigu) lève. Un échec ambigu garde la
  réservation (Meta a pu recevoir : la reprise doublerait le message, TCK-766). Une inéligibilité
  (`deferred` : contact non consentant, hors fenêtre sans gabarit) garde aussi la réservation : ce
  n'est pas un échec d'envoi, et la rendre ferait grossir la fenêtre à chaque passage sans
  qu'aucun ne puisse aboutir.
- Seul l'abonné sans compte est concerné : un compte a sa cloche (`database`), écrite en dernier
  quoi qu'il arrive au WhatsApp ; lever pour lui rejouerait son e-mail au passage suivant.

## Objectif

Un WhatsApp d'alerte qu'aucun fournisseur n'a accepté, pour un abonné qui n'a que ce canal, rend
la réservation : la fenêtre est annoncée au passage suivant.

## Delta à produire

- [x] `App\Exceptions\WhatsappUndelivered` (message sans destinataire).
- [x] `WhatsappChannel::fallbackToSms()` : quand le repli est refusé et que le résultat est un
      échec sûr, lève si la notification le demande (`throwsWhenWhatsappFails($notifiable)`).
- [x] `SavedSearchMatchesNotification::throwsWhenWhatsappFails()` : vrai pour un `AlertSubscriber`.
- [x] Test `tests/Feature/Search/SavedSearchWhatsappFailureTest.php`.

## Critères d'acceptation

- [x] AC1 — Abonné WhatsApp, pilote qui rend `failed` non ambigu → `last_notified_at` inchangé ;
      le passage suivant, pilote rétabli, envoie la fenêtre.
- [x] AC2 — Même abonné, pilote qui rend `failed` ambigu → `last_notified_at` avancé (aucune
      reprise).
- [x] AC3 — `WhatsappChannelTest`, `SavedSearchAlertsTest`, `SavedSearchAlertFailureLogTest`,
      `LateWhatsappFailureSmsFallbackTest` restent verts.

## Hors périmètre

- L'échec signalé **plus tard** par le webhook de Meta (`SendSmsAfterLateWhatsappFailureJob`) : le
  job d'alerte est fini, sa réservation ne se rend pas d'ici.
- Les autres notifications sans repli SMS : aucune autre ne déclare `smsFallbackAllowed()`.

## Notes d'implémentation

- Le test reste dans la fenêtre de service de 24 h pour la reprise (une heure plus tard) : un jour
  plus tard, le message tomberait hors fenêtre, sans gabarit, donc `deferred`, et rien ne partirait.
- Ablation : `WhatsappChannel.php` remis à `9bc782f33` → AC1 rouge (la reprise n'appelle pas le
  pilote : `last_notified_at` n'est pas nul), AC2 vert ; correctif remis → 2 verts.
