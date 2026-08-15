---
id: TCK-283
title: Registre templates Meta + webhook statut WhatsApp (DLR) + opt-out
status: done
phase: P3
family: applicatif
estimate: M
wave: 36
created: 2026-06-17
updated: 2026-08-12
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

- [x] Migration: `add_meta_columns_to_notification_templates` — `meta_template_name`, `meta_category`, `meta_status` (strings nullable), `meta_variables` (`json` nullable, **pas de DEFAULT JSON**). Cast model `meta_variables` → array (défaut `[]`).
- [x] Résolution template: `WhatsappChannel` résout `event + locale` → template Meta approuvé + params ordonnés ; hors fenêtre sans template approuvé → fallback SMS.
- [x] Route: `routes/api/whatsapp-webhooks.php` (miroir `sms-webhooks.php`) — `POST /api/webhooks/whatsapp/status/{token}`, middleware throttle + (option) restrict.ip.
- [x] Controller: `app/Http/Controllers/Webhook/WhatsappStatusController.php` — vérif token + signature `X-Hub-Signature-256`, parse statuts delivered/read/failed, dispatch job async, 200 immédiat.
- [x] Job: mise à jour de `NotificationDeliveryAttempt` via `DeliveryAttemptUpdater` (lookup O(1) par `(provider='whatsapp_cloud', provider_message_id)`).
- [x] Opt-out: honorer `WhatsappContact.opt_in_status = opted_out` côté sortant (déjà checké en TCK-282) + endpoint/toggle préférence.
- [x] Tests: webhook delivered/read/failed met à jour l'attempt ; signature invalide → 403 ; rejeu idempotent ; résolution template approuvé vs absent → fallback.

## Critères d'acceptation

- [x] AC1 — `meta_*` colonnes migrées ; `migrate:fresh --seed` OK.
- [x] AC2 — Hors fenêtre avec template `approved` → envoi template ; sans template approuvé → fallback SMS.
- [x] AC3 — Webhook `delivered`/`read`/`failed` met à jour le bon `NotificationDeliveryAttempt`.
- [x] AC4 — Signature `X-Hub-Signature-256` invalide → 403 ; payload rejoué → pas de double mise à jour.
- [x] AC5 — Réponse 200 immédiate, traitement async.
- [x] AC6 — `./vendor/bin/pint` clean.

## Hors périmètre

- Outillage de création/synchronisation des templates avec Meta (Business Manager).
- OTP/2FA sur WhatsApp.
- Inbound mise-en-relation (webhook entrant des messages, deep links `wa.me`).

## Notes d'implémentation

- **Résolution template en deux temps** : `WhatsappChannel::resolveTemplateRef()` privilégie un `WhatsappTemplateRef` auto-porté par la notification (chemin TCK-282), puis consulte le registre via `Whatsapp\TemplateResolver` (ligne `channel=whatsapp`, `event+locale`, `meta_status=approved`). Sans template approuvé → `null` → fallback SMS. Les **valeurs** des variables viennent de la notification (`whatsappTemplateParams()`, optionnel via `method_exists`) ; le registre fournit le **nom** Meta + la garantie d'approbation.
- **Pas de `restrict.ip`** sur le webhook : le `RestrictIpMiddleware` lit `config('sms.webhook_allowed_ips.*')` et les IP d'egress Meta ne sont pas allowlistables de façon stable. Auth = `{token}` URL + HMAC `X-Hub-Signature-256` (app secret) + `throttle:120,1`. La signature est le contrôle primaire.
- **Signature** : vérifiée seulement si `whatsapp.webhook_app_secret` est configuré (sinon skip pour local/testing) ; HMAC-SHA256 du **corps brut** comparé en `hash_equals`.
- **Async + idempotence** : le controller répond 200 immédiat et dispatch `UpdateWhatsappDeliveryStatusJob` (sync en test). Le job mappe `sent→sent`, `delivered/read→delivered`, `failed→failed` et délègue à `DeliveryAttemptUpdater` (lookup O(1) `(provider='whatsapp_cloud', provider_message_id)`, no-op si statut déjà appliqué).
- **Garde monotone (anti-régression DLR)** : Meta ne garantit ni l'ordre ni l'unicité des accusés ; un `sent` tardif/rejoué après un `delivered` ne doit pas écraser la ligne ni effacer `delivered_at`. `applyStatus()` accepte un param optionnel `statusPrecedence` (ordre bas→haut) ; le job WhatsApp passe `[sent, delivered, failed]` et un statut de rang inférieur au statut courant est ignoré. Param additif et opt-in — les appelants SMS/paiement conservent la sémantique last-write.
- **`meta_variables`** : JSON nullable (pas de DEFAULT), cast `array` + accesseur `metaVariables()` défaut `[]`.
- **Opt-out** : honoré côté sortant (TCK-282) ; helpers `WhatsappContact::optOut()/optIn()` ajoutés. Le toggle utilisateur passe par la matrice de préférences existante (canal `whatsapp` désormais présent dans `PreferenceResolver::CHANNELS`).
- Tests : `tests/Feature/Http/Webhook/WhatsappStatusWebhookTest` (delivered/read/failed, token 404, signature 403, replay idempotent) + 2 cas registre dans `WhatsappChannelTest`.
