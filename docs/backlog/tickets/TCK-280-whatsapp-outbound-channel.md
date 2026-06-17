---
id: TCK-280
title: Canal de notification WhatsApp sortant
status: todo
phase: P3
family: applicatif
estimate: L
created: 2026-06-17
updated: 2026-06-17
depends_on: [TCK-102, TCK-110]
blocks: [TCK-281]
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#31-integration-
    - docs/models-spec.md#54-whatsappcontact-
tags: [back, notifications, whatsapp, integration]
---

## Objectif utilisateur

Recevoir les notifications mobiles (confirmations de réservation, rappels, relances) sur **WhatsApp** quand c'est possible, avec un repli **SMS** transparent garantissant la livraison.

## Contrat de données

- **Nouvelle table** `whatsapp_contacts` (voir `spec_refs.models` §54) — contact E.164, consentement, base de la fenêtre 24h (`last_inbound_at`).
- **Integration** `provider = whatsapp_cloud` (voir §31) — `credentials` chiffrés (phone_number_id, access_token, waba_id), `metadata` (verify token, app secret).
- Réutilisé tel quel : `NotificationDeliveryAttempt` (index unique `(provider, provider_message_id)`), `NotificationChannel::Whatsapp` (enum déjà présent), `User.phone` + `phone_verified_at`.
- Aucun nouvel endpoint public (canal interne au pipeline `Notification`).

## Contraintes strictes (métier)

- **Mutuellement exclusif** : pour une notification dual-capable, un seul canal mobile part — `whatsapp` si éligible, sinon `sms`. Jamais les deux.
- **Conformité Meta** : en fenêtre 24h → texte libre ; hors fenêtre → template approuvé obligatoire ; catégories `authentication`/`utility` uniquement, jamais `marketing`.
- **Consentement** : jamais d'envoi à un contact `opted_out` ; gate `phone_verified_at` ; opt-in par événement via `PreferenceResolver` (sauf événement critique).
- **Filet de sécurité SMS** : si WhatsApp inéligible (opted-out, hors fenêtre sans template approuvé) ou échec dur → bascule **automatique** vers SMS. Le repli part **toujours** dès que WhatsApp était le canal mobile retenu (le gate `phone_verified_at` reste requis ; l'opt-in SMS n'est **pas** re-vérifié — l'utilisateur a déjà consenti au mobile pour cet événement). Exactement **un** envoi mobile final.
- `migrate:fresh --seed` doit passer (strings au lieu d'`enum()` MySQL).

## Delta à produire

Structure miroir du SMS (TCK-102/110), mais **mono-provider** Meta (pas de routage opérateur, pas de quiet hours) :

- [ ] Config: `config/whatsapp.php` (miroir `config/sms.php`) — `base_uri` (version Graph API), `default_driver` (`cloud`|`log`), `rate_limit.per_user_per_hour`, `integration_provider = whatsapp_cloud`.
- [ ] Migration: `create_whatsapp_contacts_table` (colonnes per §54 ; `opt_in_status` string, **pas d'enum() MySQL** ; `phone` unique).
- [ ] Model: `app/Models/WhatsappContact.php` — `belongsTo(User)`, scopes `withinServiceWindow()`, `optedIn()`.
- [ ] Service: `app/Services/Notifications/Whatsapp/WhatsappResult.php` (miroir `SmsResult` : statuts `sent`/`failed`/`deferred_to_fallback`/`delivered`, fabriques `sent()`/`failed()`/`deferred()`, `isTerminalSuccess()`, `shouldFallback()`).
- [ ] Service: `app/Services/Notifications/Whatsapp/WhatsappDriverInterface.php` — `send(array|string $to, ...): array`, `id()`.
- [ ] Service: `app/Services/Notifications/Whatsapp/CloudApiWhatsappDriver.php` — POST Graph `/{phone_number_id}/messages` ; `text` (en fenêtre) et `template` (hors fenêtre) ; renvoie `provider_message_id`, `status`.
- [ ] Service: `app/Services/Notifications/Whatsapp/LogWhatsappDriver.php` — dev/test, zéro réseau.
- [ ] Service: `app/Services/Notifications/Whatsapp/ServiceWindow.php` — `isOpen(WhatsappContact): bool` = `last_inbound_at` < 24h.
- [ ] Concern: `app/Notifications/Concerns/SupportsWhatsapp.php` (interface) — `toWhatsapp(object $notifiable): string`, `whatsappTemplate(object $notifiable): ?WhatsappTemplateRef`, `shouldSendWhatsapp(): bool`, `isCriticalWhatsapp(): bool` (miroir `SupportsSms`).
- [ ] Channel: `app/Notifications/Channels/WhatsappChannel.php` (miroir `SmsChannel`) — checks (implémente l'interface, `shouldSendWhatsapp()`, phone valide, gate `phone_verified_at`, contact non `opted_out`, opt-in via `PreferenceResolver` canal `whatsapp` sauf `isCriticalWhatsapp()`, rate-limit clé `whatsapp-channel:user:{id}`) ; logique fenêtre (ouverte → texte ; fermée → template approuvé sinon fallback) ; **fallback cross-canal** : appel direct `SmsRouterDriver::send()` avec le même contexte, log d'un attempt `whatsapp_cloud` puis de l'attempt SMS.
- [ ] Service: `app/Services/Notifications/PreferenceResolver.php` — ajouter `CHANNEL_WHATSAPP='whatsapp'`, l'ajouter à `CHANNELS` + `DEFAULTS` (false), appliquer le gate `phone_verified_at` (comme SMS) dans `shouldSend()` + `matrixFor()` ; ajouter `resolveMobileChannel(User, eventType): ?string` (whatsapp si éligible, sinon sms, sinon null).
- [ ] Provider: `app/Providers/AppServiceProvider.php` — singletons des services Whatsapp + binding `WhatsappDriverInterface` (cloud vs log selon config) + `ChannelManager::extend('whatsapp', …)` (miroir enregistrement SMS).
- [ ] Pilote: `app/Notifications/NewBookingNotification.php` — implémenter `SupportsWhatsapp` + `SupportsSms` ; `via()` ajoute le canal mobile unique via `resolveMobileChannel()`.
- [ ] Tests: `tests/Feature/Services/Whatsapp/` — `Http::fake()` uniquement, zéro appel réel Meta.

## Critères d'acceptation

- [ ] AC1 — Envoi texte en fenêtre (contact `last_inbound_at` < 24h) part en `text` via le driver cloud.
- [ ] AC2 — Hors fenêtre avec template approuvé → envoi `template`.
- [ ] AC3 — Échec dur WhatsApp → bascule SMS, **exactement un** envoi mobile final, deux attempts tracés (`whatsapp_cloud` puis SMS).
- [ ] AC4 — Contact `opted_out` ignoré → bascule SMS sans tenter WhatsApp.
- [ ] AC5 — Sélection mutuellement exclusive : `via()` ne contient jamais `whatsapp` ET `sms`.
- [ ] AC6 — Branche fenêtre ouverte vs fermée couverte par les tests.
- [ ] AC7 — Rate limit `whatsapp-channel:user:{id}` respecté (non bloquant pour critique).
- [ ] AC8 — `migrate:fresh --seed` OK ; `./vendor/bin/pint` clean.

## Hors périmètre

- Registre de templates Meta (colonnes `meta_*` sur `notification_templates`) + webhook de statut (DLR) + toggle opt-out → **TCK-281**.
- OTP/2FA sur WhatsApp (flux auth distinct, ticket dédié ultérieur).
- Inbound mise-en-relation WhatsApp (voir `docs/takussan-whatsapp-implementation.md`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
