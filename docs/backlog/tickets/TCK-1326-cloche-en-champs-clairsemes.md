---
id: TCK-1326
title: "La cloche demande ses colonnes : `fields[app_notifications]` sans `data`"
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
    - "docs/features.md#23-notifications"
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [front, notifications, sparse-fieldsets, performance, pistes]
---

## Contexte

Réf : **P128.05** du fichier de pistes, `retenu · autonome` (A1 et A2).

`fetchNotifications` n'envoyait pas `fields[app_notifications]` : `GET /api/notifications` rendait
`data` et `sent_at`, qu'aucun lecteur du front n'emploie, et `data` resigne à chaque lecture les
pièces d'une retenue sur caution. La cloche relit la page toutes les 30 s.

## Objectif utilisateur

La cloche ne charge que ce qu'elle affiche.

## Contrat de données

`GET /api/notifications?fields[app_notifications]=id,type,code,params,target,title,body,is_read,read_at,created_at`
— la ressource sait déjà borner ces champs (`AppNotificationResource::FIELDS`). Aucun changement
d'API.

## Delta à produire

- [x] `fetchNotifications` envoie `fields[app_notifications]` (colonnes lues par la cloche et
  l'historique).
- [x] Test `notifications-champs.test.ts`.

## Critères d'acceptation

- [x] AC1 — l'URL appelée porte `fields[app_notifications]` avec les dix colonnes, sans `data` ni
  `sent_at`, et garde `page`, `per_page`, `filter[unread]`.

## Hors périmètre

- Le coût en requêtes de `dataAtRead`, non mesuré : il ne s'exécute plus pour la cloche.

## Notes d'implémentation

- Ablation : la ligne `fields[app_notifications]` retirée → rouge ; remise → vert.
