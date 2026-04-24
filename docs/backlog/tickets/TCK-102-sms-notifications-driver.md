---
id: TCK-102
title: "SMS notifications critiques (driver prod)"
status: todo
phase: P2
family: applicatif
estimate: S
created: 2026-04-24
updated: 2026-04-24
depends_on: [TCK-022, TCK-069, TCK-070]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#12-appnotification-
tags: [back, notifications, sms, integration]
---

## Objectif utilisateur

Permettre à un Locataire / Agent de **réellement recevoir** un SMS pour
les notifications critiques (2FA, confirmation de réservation, alerte
paiement) en remplaçant le driver SMS log-only existant par un vrai
provider, configurable au niveau agence.

## Contrat de données

**Backend uniquement.**

Remplacer le driver SMS log-only de TCK-069/070 par un driver
**production-ready**. Choix initial : **Twilio** (couverture
internationale + SDK PHP officiel). Alternative à éclairer en review :
**Wave Business SMS** (couverture Sénégal renforcée, tarif local).
Décision finale documentée par implementing-specs ; le driver doit
toutefois être **interchangeable** via la config.

**Configuration via Integration** (cf. `features.md` §31 — système
d'intégration générique) :

- Enregistrer un provider de type `sms` avec credentials chiffrés
  (account_sid, auth_token, from_number, ou équivalent Wave).
- Une agence peut activer `notifications.sms.enabled` et lier un
  `Integration` SMS spécifique.

**Driver Laravel** :

- Implémenter `App\Services\Notifications\Sms\SmsDriverInterface` avec
  méthode `send(string $to, string $message, array $context): SmsResult`.
- Drivers : `LogSmsDriver` (existant), `TwilioSmsDriver` (nouveau),
  optionnellement `WaveBusinessSmsDriver`.
- Bind via `SmsDriverFactory` selon la config agence.

**Channel Laravel Notification** :

- Channel custom `SmsChannel` qui délègue au driver injecté.
- Format `via()` : `[..., SmsChannel::class]` quand le User a opté pour
  SMS (cf. `NotificationPreference` — TCK-070) **et** que la
  notification est marquée `critical=true`.

**Tracking** :

- Persister chaque tentative SMS dans
  `AppNotification.delivery_attempts` (cf. spec_refs.models) :
  status (`sent` / `failed` / `delivered`), provider_message_id,
  failure_reason, sent_at.
- Webhook Twilio (`POST /api/webhooks/sms/twilio/status`) pour mettre à
  jour le status en async (`delivered`, `failed`).

## Contraintes strictes (métier)

- **Le driver est sélectionné par agence** via leur Integration SMS
  active. Pas de driver global par défaut en prod (sinon log-only).
- **Numéros internationaux** : validation E.164 obligatoire avant send
  (rejette malformed côté lib `propaganistas/laravel-phone` ou
  équivalent).
- **Rate limiting** : max 5 SMS / utilisateur / heure (configurable),
  protection abuse 2FA brute-force.
- **Pas de SMS sur les notifications non-critiques** — uniquement quand
  `notification->shouldSendSms() === true` ET `User.NotificationPreference`
  l'autorise.
- **Coût visible** : chaque envoi loggue le coût estimé (pricing Twilio
  par pays) dans ActivityLog pour audit budget.
- **Credentials** : stockés chiffrés via `Integration.config`
  (Crypt::encryptString). Jamais en clair dans le code.
- **Webhook signé** : valider la signature Twilio (`X-Twilio-Signature`)
  avant de traiter le callback de status.
- **Fallback gracieux** : si le driver throw, le worker queue retry 3x ;
  après échec final, marquer `delivery_attempts` failed et envoyer un
  email de fallback (in-app reste dispo de toute façon).

## Delta à produire

- [ ] Composer : `composer require twilio/sdk` (ou équivalent retenu).
- [ ] Interface : `App\Services\Notifications\Sms\SmsDriverInterface`.
- [ ] Driver : `TwilioSmsDriver` (`send`, `getStatus`).
- [ ] Factory : `SmsDriverFactory` (résout selon agence).
- [ ] Channel : `App\Notifications\Channels\SmsChannel`.
- [ ] Migration : `add_delivery_attempts_to_app_notifications` (si
      structure absente).
- [ ] Migration : `add_sms_integration_type_to_integrations` (si non
      existante côté §31).
- [ ] Controller : `Webhook\TwilioSmsStatusController` + route signée.
- [ ] Trait : `Critical` sur les Notification existantes (2FA, booking
      confirm, payment alert) → `shouldSendSms()` retourne true.
- [ ] Rate limit middleware sur les envois SMS.
- [ ] Tests : `TwilioSmsDriverTest` (mock HTTP), `SmsChannelTest`,
      `TwilioWebhookTest` (signature valide / invalide), test
      e2e d'une 2FA → SMS via fake driver.
- [ ] Doc : `docs/integrations/sms.md` (setup Twilio / Wave, env vars).

## Critères d'acceptation

- [ ] AC1 — une Notification `critical=true` à un user opt-in SMS
      déclenche un appel au driver Twilio (vérifié via mock HTTP).
- [ ] AC2 — une Notification non-critique ne déclenche **jamais** d'envoi
      SMS, même si l'user est opt-in.
- [ ] AC3 — un user opt-out SMS ne reçoit jamais de SMS, même critique.
- [ ] AC4 — numéro malformé (non E.164) → 422 / rejeté avant appel
      provider.
- [ ] AC5 — rate limit dépassé (>5/h) → SMS différé ou rejeté avec log.
- [ ] AC6 — webhook Twilio avec signature invalide → 403, status non
      modifié.
- [ ] AC7 — webhook valide met à jour `delivery_attempts.status` en
      `delivered` / `failed`.
- [ ] AC8 — driver injecté via `SmsDriverFactory` est interchangeable
      (test : swap Twilio ↔ Wave en config).

## Hors périmètre

- WhatsApp Business / autres canaux messaging (P3, ticket dédié).
- UI admin de gestion des Integration SMS (couverte par TCK-064 ou
  ticket §31 dédié).
- Templates SMS multi-langues éditables par l'agence (P3 — texte en dur
  via Lang dans ce ticket).
- Stats consolidées de delivery (P3 — la donnée existe via
  `delivery_attempts`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
