---
id: TCK-1124
title: "L'éditeur de gabarits ne sert que les couples événement × canal qu'un envoi lit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-98--écrans-décriture-de-la-console-super-admin--ce-quils-changent-hors-de-la-console"
tags: [back, front, notifications, super-admin, templates, pistes]
---

## Contexte

Réf : **P98.03** du fichier de pistes, `validé (délégué)` (V7 accordé : retirer de l'éditeur les
couples qu'aucun envoi ne lit, comme ADR-0032 le pose pour les préférences).

L'éditeur de gabarits du super-admin servait `email`, `sms` et `push` pour chacun des trois
événements. `NotificationRenderer::fromTemplate()` ne lit que les surfaces e-mail et SMS : un
gabarit `push` actif n'est lu par rien (D-65), et `maintenance_created` n'a aucun code mobile,
donc aucun SMS ne lit son gabarit.

## Décision du porteur (déléguée)

ne servir à l'éditeur que les couples événement × canal qu'un envoi lit, dérivés en API des codes dont `templateEvent()` rend l'événement : `email` pour chacun, `sms` seulement si l'un de ces codes est `mobile()`, jamais `push` tant que D-65 tient ; `GET /api/admin/notification-templates` ne rend que ces couples, et `ensureEditable()` refuse les autres par l'erreur existante `notification_channel_not_editable` ; l'écran tire ses onglets des couples rendus au lieu de la constante `CHANNELS` ; les lignes `notification_templates` existantes ne sont ni supprimées ni réécrites ; aucun texte neuf ; test : pour chaque couple servi, un gabarit actif se retrouve dans le rendu de son canal, et `maintenance_created`/`sms` et `*/push` ne sont plus servis ; reste : brancher `title`/`body` sur un gabarit `push`, au porteur

## Reste à faire

brancher `title`/`body` sur un gabarit `push`, au porteur

## Objectif utilisateur

L'opérateur de la console n'édite que des gabarits qu'un envoi applique réellement.

## Delta à produire

- [x] `EditableNotificationEvents::channels($event)` dérive les canaux des codes dont
      `templateEvent()` rend l'événement (`email` ; `sms` si l'un est `mobile()`), à la place de
      la constante `CHANNELS`.
- [x] `NotificationTemplateService::all()` et `ensureEditable()` s'y bornent ; les lignes
      `notification_templates` existantes ne sont pas touchées.
- [x] `TemplateEditor` reçoit les canaux servis (`channels`) ; la page les tire des couples
      rendus pour l'événement choisi.
- [x] Tests : `NotificationTemplateChannelsTest` (API), `TemplateEditor.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — `GET /api/admin/notification-templates` rend exactement `booking_confirmed/email`,
      `booking_confirmed/sms`, `payment_received/email`, `payment_received/sms`,
      `maintenance_created/email`.
- [x] AC2 — `GET` et `PATCH` sur `maintenance_created/sms` et `*/push` → 422
      `notification_channel_not_editable`, sans écriture.
- [x] AC3 — pour chaque couple servi, un gabarit actif se retrouve dans le rendu de son canal.
- [x] AC4 — l'éditeur n'affiche que les onglets de canal servis.

## Hors périmètre

- Brancher `title`/`body` sur un gabarit `push` (reste du porteur).
- Le type front `NotificationTemplateChannel` garde `push` : il décrit une valeur de canal, et
  plus rien ne le lit comme liste d'onglets.
- Aucun texte neuf.

## Notes d'implémentation

- Ablation : `app/` (deux fichiers) et `notification-templates.tsx` rendus à `pre-dev` → 3 rouges
  sur 3 côté API, 1 rouge sur 2 côté front ; correctif remis → tout vert.
- La table `notification_templates` porte aussi les gabarits WhatsApp semés par migration : le
  test « sans écriture » compare le compte avant et après, et non à zéro.
