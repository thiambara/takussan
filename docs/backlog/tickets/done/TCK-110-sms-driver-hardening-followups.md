---
id: TCK-110
title: "Durcissement SMS driver — race conditions OAuth, SSRF métadonnées, table delivery_attempts normalisée"
status: done
phase: P2
family: technique
estimate: M
wave: 11
created: 2026-04-26
updated: 2026-04-26
depends_on: [TCK-102]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#31-integrations
  models:
    - docs/models-spec.md#12-appnotification-
    - docs/models-spec.md#31-integration-
tags: [back, front, notifications, sms, integration, hardening]
---

## Objectif utilisateur

Garantir que le driver SMS multi-provider (TCK-102) tient la charge en
production : pas de double-facturation Orange OAuth sous burst de queue
workers, pas de DLR ambigus entre notifications, pas d'exfiltration
silencieuse des champs `metadata` quand un admin "vide" un champ.

## Contrat de données

**Backend :**

- Modifier `App\Services\Notifications\Sms\Drivers\OrangeSmsDriver` —
  refresh OAuth sous `Cache::lock("sms:orange:oauth:{integrationId}", 10)`.
- Nouvelle migration `create_notification_delivery_attempts_table` +
  backfill depuis `app_notifications.delivery_attempts` JSON.
- Nouveau model + relation `AppNotification::deliveryAttempts()` (hasMany).
- Refactor `App\Services\Notifications\Sms\DeliveryAttemptUpdater` et
  `SmsRouterDriver::appendAttempt` → écrire dans la nouvelle table
  (avec `(provider, provider_message_id)` unique index).
- Drop colonne legacy `app_notifications.delivery_attempts` après
  vérification du backfill (migration séparée, non bloquante).

**Frontend :**

- Modifier `takussan-web/src/lib/schemas/setting.ts#normaliseIntegrationForm`
  — toujours envoyer `metadata` (objet possiblement vide) en mode `edit`
  pour que le backend distingue "champ effacé" vs "champ inchangé".
- Modifier le contrôleur Integration backend pour traiter `metadata: {}`
  comme "remplacement total" (sémantique PUT) au lieu de "ne rien
  toucher".

## Contraintes strictes (métier)

- **OAuth Orange** : un seul appel `/oauth/v3/token` par fenêtre de
  refresh, peu importe le nombre de workers concurrents — sinon Orange
  rate-limite l'auth et fait basculer la chaîne entière sur LAM.
- **DLR matching** : le couple `(provider, provider_message_id)` doit
  être unique. Aucune ambiguïté de substring possible (ex.
  `mtg-77` ne doit pas matcher `mtg-770`).
- **Backfill `delivery_attempts`** : zéro perte d'historique. La
  table existante peut contenir des notifications déjà livrées avec
  des DLR en cours — la migration doit préserver l'ordre `attempt`.
- **Métadonnées Integration** : effacer un champ via le formulaire
  doit le supprimer côté serveur. Aujourd'hui le frontend omet
  `metadata` du payload quand tous les champs sont vides → l'ancien
  `notes` ou `sender_id` reste en base à perpétuité.
- **Mtarget webhook** : si l'investigation du provider révèle un
  mécanisme de signature payload, le câbler. Sinon documenter
  explicitement le résidu de risque dans `docs/integrations/sms.md`
  et durcir la règle "IP allowlist obligatoire en prod" déjà en place
  dans `RestrictIpMiddleware`.

## Delta à produire

- [ ] Wrap OAuth refresh dans `OrangeSmsDriver::getToken()` avec
  `Cache::lock(...)->block(5, fn () => …)`. Sur 401 retry, re-lire le
  cache au lieu de re-call `getToken()`.
- [ ] Migration: `create_notification_delivery_attempts_table` —
  colonnes `(id, app_notification_id, attempt, provider,
  provider_message_id, status, failure_reason, sent_at, delivered_at,
  cost_estimate, segments_count)` + index unique
  `(provider, provider_message_id)`.
- [ ] Model: `App\Models\NotificationDeliveryAttempt` + cast +
  relation `AppNotification::deliveryAttempts()`.
- [ ] Backfill: command `php artisan sms:backfill-delivery-attempts`
  qui itère `AppNotification::whereNotNull('delivery_attempts')` et
  crée les rows correspondantes (idempotent via unique index).
- [ ] Refactor: `DeliveryAttemptUpdater::applyStatus()` →
  `where(['provider' => …, 'provider_message_id' => …])->lockForUpdate()`
  sur la nouvelle table. Plus de `LIKE '%…%'`.
- [ ] Refactor: `SmsRouterDriver::appendAttempt()` →
  `$notification->deliveryAttempts()->create(...)` au lieu de
  `forceFill(['delivery_attempts' => …])`.
- [ ] Migration séparée: `drop_delivery_attempts_from_app_notifications`
  (à merger dans une release ultérieure une fois le backfill validé en
  prod).
- [ ] Frontend: `normaliseIntegrationForm` envoie `metadata: {}` en
  mode edit même si vide. `IntegrationFormPayload.metadata` devient
  non-optional en mode edit.
- [ ] Backend: `IntegrationController@update` interprète
  `metadata: {}` comme "remplacer entièrement" (sémantique PUT) au
  lieu de "ignorer". Garder le comportement actuel pour `metadata`
  absent du body.
- [ ] Investigation Mtarget HMAC : lire la doc dev.mtarget.fr,
  contacter le support si besoin. Soit câbler la vérif signature dans
  `MtargetSmsStatusController`, soit documenter dans
  `docs/integrations/sms.md` la dépendance unique sur path token + IP
  allowlist.
- [ ] Tests: `OrangeOAuthLockTest` (10 sends parallèles → 1 seul
  appel OAuth via `Http::assertSentCount`).
- [ ] Tests: `NotificationDeliveryAttemptsTableTest` (backfill +
  unique index empêche les doublons + DLR webhook trouve via
  index O(1)).
- [ ] Tests: `IntegrationMetadataEditTest` (effacer un champ
  `notes`/`sender_id` via le form le supprime bien côté serveur).
- [ ] Tests Vitest: `IntegrationsManager.test.tsx` étendu pour
  vérifier que `metadata: {}` est bien envoyé en mode edit avec champs
  vides.

## Critères d'acceptation

- [ ] AC1 — Sous 10 workers concurrents qui invalident le cache OAuth
  Orange en même temps, un seul `POST /oauth/v3/token` part vers
  Orange (vérifié par `Http::assertSentCount(1)` dans le test).
- [ ] AC2 — Un DLR webhook contenant `provider_message_id=mtg-77`
  ne matche pas une notification dont l'`provider_message_id=mtg-770`
  (test paramétré couvrant le cas substring).
- [ ] AC3 — `delivery_attempts` JSON column est vide ou absente sur
  toutes les `AppNotification` après le backfill ; tous les attempts
  historiques sont retrouvables via la nouvelle table avec
  `attempt` et `provider_message_id` conservés à l'identique.
- [ ] AC4 — Quand un admin édite un Integration `sms_mtarget` et
  efface `metadata.notes`, le `GET /api/integrations/{id}` suivant
  ne retourne plus le champ `notes`.
- [ ] AC5 — `docs/integrations/sms.md` contient une section
  explicite sur la posture sécurité Mtarget (HMAC câblé OU
  documentation du risque résiduel + obligation IP allowlist).
- [ ] AC6 — Pint clean, 1316+ tests backend verts (incluant les
  nouveaux), tests Vitest verts.
- [ ] AC7 — Aucun changement de comportement visible utilisateur sur
  les flux SMS existants (envois Orange/Mtarget/LAM, fallback chain,
  Orange daily cap, quiet hours) — vérifié par non-régression de la
  suite SMS de TCK-102.

## Hors périmètre

- Optimisations avancées de la chaîne fallback (TPS limiter dynamique,
  circuit breaker provider) — séparé.
- Support nouveaux providers (Free SN/Yas, Expresso) — toujours hors
  v1, attente contrat B2B.
- Refactor du frontend Integration form au-delà du fix metadata
  edit-mode (split UI provider-aware, validation visuelle des
  credentials, etc.).
- Migration des autres canaux notification (email, push) vers une
  table d'attempts normalisée — si jugé utile, ouvrir un ticket
  dédié.
- Rotation automatique du `SMS_WEBHOOK_URL_TOKEN` — opérationnel,
  hors scope dev.

## Notes d'implémentation

- **Drop legacy `delivery_attempts` JSON column — déféré.** Le ticket
  marque la migration `drop_delivery_attempts_from_app_notifications`
  comme « non bloquante, à merger dans une release ultérieure ». Cette
  PR ne crée donc PAS la migration de drop : la colonne reste
  présente, vide pour toutes les nouvelles notifications (plus aucun
  écrit n'y atterrit), prête à être supprimée par une PR de suivi
  une fois le backfill validé en prod. AC3 satisfait par la branche
  « vide » (« vide OU absente »).
- **Index `(provider, provider_message_id)` strictement unique.** Les
  `provider_message_id` peuvent légitimement collisionner _entre
  providers_ (ex. deux providers utilisant des UUID v4). L'index
  unique est sur la **paire** : `('orange', 'shared-id')` et
  `('mtarget', 'shared-id')` cohabitent — couvert par
  `NotificationDeliveryAttemptsTableTest::test_unique_index_allows_same_id_for_different_providers`.
- **`metadata: {}` côté contrôleur.** Le payload utilise
  `$request->has('metadata')` pour distinguer « clé absente » de
  « clé présente avec valeur vide ». Quand la clé est présente mais
  l'array validé est `null`, on coerce en `[]` pour que `fill()`
  écrase effectivement la colonne JSON. Cas couvert par
  `IntegrationMetadataEditTest`.
- **Mtarget HMAC.** Investigation : Mtarget v2 (SMSPRO) ne publie
  toujours pas de signature de payload. Section explicite ajoutée à
  `docs/integrations/sms.md` (« Posture Mtarget — HMAC absent »)
  documentant le risque résiduel et l'obligation IP allowlist en
  prod. AC5 satisfait par la branche « documentation ».
- **Tests.** 1325 backend (+9 nouveaux) verts en 227s ; 427 frontend
  (+2 nouveaux) verts. Pint clean.
