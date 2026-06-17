---
id: TCK-283
title: Registre templates Meta + webhook statut WhatsApp (DLR) + opt-out
status: todo
phase: P3
family: applicatif
estimate: M
created: 2026-06-17
updated: 2026-06-17
depends_on: [TCK-282]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#55-notificationtemplate--extension-whatsapp-
tags: [back, notifications, whatsapp, webhook]
---

## Objectif utilisateur

Garantir des envois WhatsApp hors fenêtre conformes (templates approuvés Meta), un suivi de livraison fiable (accusés delivered/read/failed) et le respect de l'opt-out.

## Contrat de données

- **Extension** `notification_templates` (voir `spec_refs.models` §55) — colonnes `meta_template_name`, `meta_category`, `meta_status`, `meta_variables`.
- Réutilisé tel quel : `NotificationDeliveryAttempt` + index unique `(provider, provider_message_id)` ; service existant `DeliveryAttemptUpdater` (TCK-110) ; pattern routes `routes/api/sms-webhooks.php` (token + IP + signed).
- **Nouvel endpoint** : `POST /api/webhooks/whatsapp/...` (statuts Meta).

## Contraintes strictes (métier)

- Hors fenêtre 24h + pas de template `meta_status = approved` pour `event + locale` → canal WhatsApp inéligible → bascule SMS (logique déjà câblée en TCK-282, désormais alimentée par le registre).
- Catégories `authentication`/`utility` uniquement ; jamais `marketing`.
- Webhook : vérifier la signature `X-Hub-Signature-256`, exempter CSRF, **idempotent**, répondre **200 immédiat** + traitement async (job).
- Opt-out : honorer le flag `opted_out` (toggle préférence pour le sortant ; l'opt-out par mot-clé STOP relève de l'inbound, hors périmètre).

## Delta à produire

- [ ] Migration: `add_meta_columns_to_notification_templates` — `meta_template_name`, `meta_category`, `meta_status` (strings nullable), `meta_variables` (`json` nullable, **pas de DEFAULT JSON**). Cast model `meta_variables` → array (défaut `[]`).
- [ ] Résolution template: `WhatsappChannel` résout `event + locale` → template Meta approuvé + params ordonnés ; hors fenêtre sans template approuvé → fallback SMS.
- [ ] Route: `routes/api/whatsapp-webhooks.php` (miroir `sms-webhooks.php`) — `POST /api/webhooks/whatsapp/status/{token}`, middleware throttle + (option) restrict.ip.
- [ ] Controller: `app/Http/Controllers/Webhook/WhatsappStatusController.php` — vérif token + signature `X-Hub-Signature-256`, parse statuts delivered/read/failed, dispatch job async, 200 immédiat.
- [ ] Job: mise à jour de `NotificationDeliveryAttempt` via `DeliveryAttemptUpdater` (lookup O(1) par `(provider='whatsapp_cloud', provider_message_id)`).
- [ ] Opt-out: honorer `WhatsappContact.opt_in_status = opted_out` côté sortant (déjà checké en TCK-282) + endpoint/toggle préférence.
- [ ] Tests: webhook delivered/read/failed met à jour l'attempt ; signature invalide → 403 ; rejeu idempotent ; résolution template approuvé vs absent → fallback.

## Critères d'acceptation

- [ ] AC1 — `meta_*` colonnes migrées ; `migrate:fresh --seed` OK.
- [ ] AC2 — Hors fenêtre avec template `approved` → envoi template ; sans template approuvé → fallback SMS.
- [ ] AC3 — Webhook `delivered`/`read`/`failed` met à jour le bon `NotificationDeliveryAttempt`.
- [ ] AC4 — Signature `X-Hub-Signature-256` invalide → 403 ; payload rejoué → pas de double mise à jour.
- [ ] AC5 — Réponse 200 immédiate, traitement async.
- [ ] AC6 — `./vendor/bin/pint` clean.

## Hors périmètre

- Outillage de création/synchronisation des templates avec Meta (Business Manager).
- OTP/2FA sur WhatsApp.
- Inbound mise-en-relation (webhook entrant des messages, deep links `wa.me`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
