---
id: TCK-821
title: "Notifications : les pièces d'une retenue sur caution sont rangées sans URL, et signées à la lecture"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#27-médias--fichiers"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-23--lectures-de-données-personnelles-sans-step-up-face-à-refused_reads"
tags: [back, notifications, media, privacy, pistes]
---

## Contexte

Réf : **P23.05** du fichier de pistes, `validé` (V3 accordé).

`LeaseDepositRefundNotification::toArray()` portait, pour chaque pièce justificative d'une retenue
sur caution, une URL signée de `media.private.show` valable 7 jours. Le canal `database` la rangeait
dans `app_notifications.data`, et `AppNotificationResource` la rendait telle quelle à
`GET /api/notifications` : un lien qui ouvre le fichier sans session (ADR-0055 §3), conservé en
base, relu sept jours, puis mort dans la cloche.

## Décision du porteur

validé — ne ranger que les identifiants des médias et signer à la lecture après autorisation ; l'URL longue reste pour le courriel

## Objectif utilisateur

Le locataire ouvre toujours les pièces de sa retenue depuis la cloche, et aucun lien vers elles
n'est conservé en base.

## Contraintes strictes

- Le courriel garde son lien de `ATTACHMENT_LINK_TTL_DAYS` (7) jours.
- `data` garde sa forme pour le front (`attachments: [{id, name, url}]`) : seule l'origine de
  `url` change. Le front ne lit pas `data.attachments` aujourd'hui (`grep` sous
  `takussan-web/src`).

## Delta à produire

- [x] `toArray()` (donc `data` et la diffusion) : `attachments` = `[{id, name}]`.
- [x] `LeaseDepositRefundNotification::attachmentsAtRead($data, $lecteur)` : URL signée de la
      durée courte de `PrivateMediaAccess` pour chaque pièce de la collection
      `lease_deposit_refund` du bail `data.lease_id`, si le lecteur peut voir ce bail ; `null`
      sinon.
- [x] `AppNotificationResource` l'appelle pour une `data` qui porte `attachments` et `lease_id`.
- [x] `tests/Feature/Notifications/DepositRefundAttachmentLinksTest.php` ; `PrivateMediaAccessTest`
      lit désormais le lien de 7 jours dans le courriel.

## Critères d'acceptation

- [x] AC1 — Après un remboursement avec une photo, la ligne `app_notifications` ne contient pas
      `signature=`, et `data.attachments` vaut `[{id, name}]`.
- [x] AC2 — `GET /api/notifications` du locataire rend une URL signée valide de la pièce, qui
      expire à `SIGNED_ROUTE_TTL_MINUTES` (30 min).
- [x] AC3 — Une pièce rangée qui n'appartient pas au bail rend `url: null`, à côté d'une pièce du
      bail signée.
- [x] AC4 — Le courriel porte toujours le lien de 7 jours.

## Hypothèses

- « Après autorisation » = `LeasePolicy::view` sur le bail `data.lease_id`, et l'appartenance de
  la pièce à sa collection `lease_deposit_refund`.
- La durée de l'URL de la cloche est celle par défaut de `PrivateMediaAccess::signedUrl()` (30 min).
- Les lignes écrites avant ce ticket gardent leur ancienne URL en base, mais la cloche la remplace
  à la lecture : elle n'est plus rendue. Aucune donnée n'est réécrite (V4).
- L'impersonation n'est pas traitée ici : la garde des GET est P23.06, validée « après P23.05 ».

## Hors périmètre

- Une garde générale sur toutes les notifications (aucune autre ne range de pièce dans `data` :
  `grep "'attachments'" app/Notifications`).

## Notes d'implémentation

- **Ablation** : notification et ressource d'origine remises, AC1, AC2 et AC3 rougissent (AC4 reste
  vert : le courriel ne change pas) ; correctif remis, 4 verts.
- Un premier AC3 sans pièce légitime à côté passait avant le correctif (l'URL était absente, donc
  « nulle ») : la pièce du bail signée à côté rend le cas discriminant.
