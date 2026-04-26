---
id: TCK-102
title: "SMS notifications critiques (driver prod, multi-provider)"
status: review
phase: P2
family: applicatif
estimate: M
created: 2026-04-24
updated: 2026-04-26
depends_on: [TCK-022, TCK-069, TCK-070]
blocks: []
spec_refs:
  features:
    - docs/features.md#23-notifications
    - docs/features.md#31-integrations
  models:
    - docs/models-spec.md#12-appnotification-
    - docs/models-spec.md#integration
tags: [back, notifications, sms, integration, routing, artp]
---

## Objectif utilisateur

Permettre à un Locataire / Agent de **réellement recevoir** un SMS pour
les notifications critiques (2FA, confirmation de réservation, alerte
paiement) en remplaçant le driver SMS log-only existant par un système
**multi-provider routé par opérateur**, conforme aux règles ARTP
(heures de silence, opt-in) et aux T&C des providers retenus.

## Contexte providers (recherche du 2026-04-26)

État du marché Sénégal pour APIs SMS auto-serve :

| Provider           | API publique self-serve ?       | Décision v1                    |
|--------------------|----------------------------------|--------------------------------|
| Orange SN          | ✅ developer.orange.com/apis/sms-sn (OAuth 2.0) | ✅ Driver dédié    |
| Mtarget            | ✅ developers.mtarget.fr/api-sms | ✅ Driver dédié                |
| LAfricaMobile      | ✅ developers.lafricamobile.com (LAMPUSH v2.3) | ✅ Driver dédié    |
| Free SN (Yas)      | ❌ Aucune — contrat B2B requis (rebrand Yas nov. 2024) | ❌ Hors v1 |
| Expresso SN        | ❌ Aucune — contrat B2B requis (probablement SMPP) | ❌ Hors v1     |

→ Les numéros Free (76) et Expresso (70/75) sont **routés via
agrégateurs** (LAM puis Mtarget), qui terminent eux-mêmes sur ces
opérateurs via leurs accords commerciaux.

## Contrat de données

**Backend uniquement.**

Remplacer le driver SMS log-only de TCK-069/070 par un système de
**3 drivers spécifiques** + **1 driver routeur** (composite pattern).
Tous implémentent la même interface : le routeur regroupe les numéros
par opérateur, délègue à chaque driver feuille, et applique la chaîne
de fallback en cas d'échec / quota / quiet hours.

### Routage par opérateur (Sénégal)

Détection via le **préfixe E.164** du numéro :

| Préfixe (après +221) | Opérateur | Driver primaire        | Fallback 1 | Fallback 2  |
|----------------------|-----------|------------------------|------------|-------------|
| 77, 78               | Orange SN | `OrangeSmsDriver`      | LAM        | Mtarget     |
| 76                   | Free SN   | `LAfricaMobileSmsDriver` | Mtarget  | —           |
| 70, 75               | Expresso  | `LAfricaMobileSmsDriver` | Mtarget  | —           |
| Autres / non +221    | —         | `LAfricaMobileSmsDriver` | Mtarget  | —           |

Mapping stocké en config (`config/sms.php` → `operator_prefixes` +
`fallback_chains`) pour ajustement sans déploiement code.

### Conditions de bascule sur le fallback (sans être une "erreur")

Le router bascule sur le driver suivant **dans la même exécution** dans
ces cas (état `deferred_to_fallback`, pas `failed`) :

- Orange : cap **3 SMS/jour/numéro** atteint (T&C Orange).
- Orange : cap **5 TPS** atteint, retry après backoff impossible dans la
  fenêtre de la requête.
- Tous : envoi pendant **heures de silence ARTP (22h–06h Africa/Dakar)**
  pour notification non-2FA → différé jusqu'à 06h OU rerouté si urgent
  (à clarifier dans la conf, par défaut : différé en queue).
- Driver throw HTTP / timeout / code erreur provider → fallback immédiat.

### Drivers à implémenter

Dans `App\Services\Notifications\Sms\Drivers\` :

- `OrangeSmsDriver` — OAuth 2.0 sur `api.orange.com/oauth/v3/token`,
  POST `/smsmessaging/v1/outbound/{senderAddress}/requests`. Pas de
  batch effectif (1 destinataire par appel HTTP). senderAddress = SIM
  Orange SN réel détenu par l'agence. Whitelist `senderName` (≤10j).
- `MtargetSmsDriver` — POST `https://api-public-2.mtarget.fr/messages`
  form-urlencoded avec `username`/`password` dans le body. Batch via
  `msisdn` comma-separated, **max 500 par appel**.
- `LAfricaMobileSmsDriver` — POST `/api/Send` (host à confirmer en
  onboarding, probablement `lampush-tls.lafricamobile.com`), JSON ou
  XML. JSON = single recipient (loop), XML = multi-`<message>`. `accountid`/
  `password` dans le body.

Plus dans `App\Services\Notifications\Sms\` :

- `SmsRouterDriver` — orchestrateur (cf. plus bas).
- `LogSmsDriver` — existant, conservé pour `local`/`testing`.

### Interface commune

```php
namespace App\Services\Notifications\Sms;

interface SmsDriverInterface
{
    /**
     * @param array<string>|string $to E.164 numbers
     * @return array<string, SmsResult> indexed by recipient
     */
    public function send(array|string $to, string $message, array $context = []): array;
}
```

`SmsResult` : DTO avec `status` (`sent` / `failed` / `deferred_to_fallback`),
`provider_message_id`, `provider`, `failure_reason`, `cost_estimate`,
`segments_count` (pour Mtarget : `smscount`).

### `SmsRouterDriver` (cœur de la feature)

- Implémente `SmsDriverInterface`.
- Sur `send()` :
  1. Normalise `$to` en `array<string>` (E.164, lib `propaganistas/laravel-phone`).
  2. **Filtrage quiet hours ARTP** : si Africa/Dakar entre 22h et 06h
     ET notification non-2FA → différer (push en queue à 06h).
  3. **Groupe par opérateur** via `OperatorResolver::resolve($number)`.
  4. Pour chaque groupe, tente le driver primaire, puis fallback chain
     pour les numéros qui ont échoué/deferred uniquement.
  5. Pour Orange : check du cap **3/jour/numéro** (compteur Redis avec
     TTL 24h) avant chaque envoi → bascule si dépassé.
  6. Agrège les `SmsResult` dans la map de retour.
- Bind par défaut dans le service container — c'est lui qu'utilise
  `SmsChannel`, jamais un driver feuille directement.

### Configuration via `Integration` (cf. features.md §31)

Les `Integration` SMS sont **multiples par agence** :

- Champ `Integration.type` : enum `sms_orange`, `sms_mtarget`,
  `sms_lafricamobile` (les types `sms_free` et `sms_expresso` sont
  **réservés mais non implémentés** — placeholders pour activation
  future après contrat B2B).
- `Integration.config` (JSON chiffré) : credentials + paramètres par
  provider :
  - Orange : `client_id`, `client_secret`, `sender_address` (tel:+221...),
    `sender_name`.
  - Mtarget : `username`, `password`, `sender_id`, `service_id` (opt).
  - LAM : `accountid`, `password`, `sender_id`, `host` (override).
- `Integration.is_active` : toggle on/off sans supprimer les creds.
- **Tarifs par provider × opérateur destination** : table en config
  (`config/sms.php` → `pricing`), pas en BDD pour la v1 — coût calculé
  à l'émission via `segments_count × rate`.

Le `SmsRouterDriver` lit toutes les Integrations SMS actives de
l'agence courante au boot du send pour construire sa table de routage.

### Webhooks de status (DLR)

**Aucun provider retenu n'expose de signature HMAC.** Le pattern
standard pour les 3 controllers :

- Route avec **path obscur signé Laravel** (`URL::signedRoute` avec un
  segment aléatoire fixe en config).
- **IP allowlist** par provider (config `sms.webhook_allowed_ips`),
  middleware `RestrictIpMiddleware`.
- **Validation par matching** : le `provider_message_id` reçu doit
  exister dans `delivery_attempts` ; sinon 404 silencieux.
- Idempotence : un même `provider_message_id` reçu 2x ne crée pas de
  doublon (UPSERT sur la sous-entrée du JSON).

Controllers (3) :

- `Webhook\OrangeSmsStatusController` — POST JSON,
  payload `deliveryInfoNotification.deliveryInfo.deliveryStatus`
  (`DeliveredToTerminal` / `DeliveryImpossible` / etc.).
- `Webhook\MtargetSmsStatusController` — POST form-urlencoded,
  payload `MsgId`, `Status`, `StatusText`, `DestinationAdress`,
  `DeliveryDateTime`. **Configuré au niveau compte** dans le dashboard
  Mtarget (pas per-message — donc URL fixe par environnement).
- `Webhook\LAfricaMobileSmsStatusController` — **GET** (oui, pas POST)
  avec query params `push_id`, `ret_id`, `to`, `status`, `text`.
  Configuré per-message via `ret_url` dans le payload de send.

### Tracking : `delivery_attempts`

Structure JSON dans `AppNotification.delivery_attempts` (cf. models §12) :

```json
[
  {
    "attempt": 1,
    "provider": "orange",
    "to": "+221771234567",
    "status": "deferred_to_fallback",
    "provider_message_id": null,
    "failure_reason": "orange_daily_cap_reached",
    "cost_estimate": null,
    "sent_at": "2026-04-26T10:00:01Z"
  },
  {
    "attempt": 2,
    "provider": "lafricamobile",
    "to": "+221771234567",
    "status": "sent",
    "provider_message_id": "lam_push_abc123",
    "segments_count": 1,
    "cost_estimate": 0.045,
    "sent_at": "2026-04-26T10:00:02Z"
  },
  {
    "attempt": 2,
    "provider": "lafricamobile",
    "to": "+221771234567",
    "status": "delivered",
    "provider_message_id": "lam_push_abc123",
    "delivered_at": "2026-04-26T10:00:08Z"
  }
]
```

→ La chaîne complète est traçable par numéro, y compris les bascules
non-erreur (cap, quiet hours).

### Channel Laravel

- `App\Notifications\Channels\SmsChannel` — délègue à `SmsRouterDriver`.
- `via()` : `[..., SmsChannel::class]` quand User opt-in SMS
  (cf. `NotificationPreference` — TCK-070) **et** Notification marquée
  `critical=true` (trait `Critical` ou `shouldSendSms()` qui retourne
  true).

## Contraintes strictes (métier & réglementaire)

### ARTP (réglementation Sénégal — applicable à TOUS les drivers)

- **Heures de silence 22h–06h Africa/Dakar** interdites pour SMS
  commerciaux. Notifications transactionnelles critiques (2FA, OTP)
  exemptées ; le reste est différé jusqu'à 06h.
- **Opt-in obligatoire** pour marketing — déjà géré via
  `NotificationPreference` (TCK-070).
- **NINEA + RCCM** requis depuis janv. 2025 (Loi 2018-28, Art. 36)
  pour souscription SMS business → impacte le formulaire d'onboarding
  d'une `Integration` SMS (UI hors périmètre, mais champ à prévoir
  dans le schéma `Integration.config`).

### Per-provider

- **Orange** :
  - 5 TPS hard limit (throttle côté router avec semaphore Redis).
  - Cap 3 SMS/jour/numéro (counter Redis TTL 24h, clé
    `sms:orange:cap:{e164}`).
  - `senderAddress` = numéro Orange SN réel détenu par l'agence
    (validation au save de l'Integration).
  - `senderName` ≤ 11 chars alphanum, whitelist Orange ~10 jours.
  - Country-locked +221 (mais peut router vers tous les MNO via
    interconnexion Sonatel).
  - Approbation locale Sonatel à l'ouverture du compte (jours).
- **Mtarget** :
  - Batch ≤ 500 numéros par appel, comma-separated dans `msisdn`.
  - Sender ID ≤ 11 chars alphanum (numérique refusé sur Orange/Expresso
    SN).
  - DLR configuré au niveau compte (URL fixe par env, pas per-message).
  - `allowunicode=true` requis pour les accents français (sinon GSM-7
    transliteration → segments billés à 160 chars vs 70).
  - Codes erreur négatifs (-1 à -15) à mapper en `failure_reason`.
- **LAfricaMobile** :
  - Sender ID ≤ 11 chars alphanum, **ne doit PAS commencer par un chiffre**.
  - `ret_url` per-message (donc URL signée par notification, pas global).
  - Callback **GET** (pas POST).
  - Statuts DLR : `SENT (4)`, `DELIVRD (6)`, `EXPIRED (12)`,
    `UNKNOWN (16)`, `REJECTD (23)`, `UNDELIVERED (2)`.
  - Host de prod à confirmer pendant onboarding.

### Transverses

- **Multi-Integration par agence** : 1 à 3 Integrations SMS actives
  simultanément (orange + mtarget + lam). Pas de driver global par
  défaut en prod (sinon log-only en `local`/`testing`).
- **Numéros E.164** : validation obligatoire (`propaganistas/laravel-phone`).
  Numéro malformé → 422 / rejeté avant routage.
- **Détection opérateur** : préfixe via `config('sms.operator_prefixes')`.
  Numéro sans match → bypass Orange, attaque LAM direct.
- **Rate limiting applicatif** : max 5 SMS / utilisateur / heure
  (configurable), protection abuse 2FA. Compté **avant routage**.
- **Pas de SMS sur les notifications non-critiques** — uniquement quand
  `notification->shouldSendSms() === true` ET
  `User.NotificationPreference` l'autorise.
- **Cost tracking** : `segments_count × pricing[provider][destination_mno]`
  loggé dans `delivery_attempts` ET ActivityLog. Pas de cost dans les
  réponses des 3 providers — table de tarifs en config par provider ×
  opérateur destination.
- **Credentials chiffrés** via `Integration.config`
  (`Crypt::encryptString`). Jamais en clair dans le code/repo/env.
- **Webhooks** : aucun provider n'a de HMAC → sécurisation par path
  signé + IP allowlist + matching `provider_message_id` stocké.
  Signature/IP invalide → 403, status non modifié.
- **Fallback gracieux** : si driver primaire throw OU retourne `failed`
  OU `deferred_to_fallback`, le router enchaîne immédiatement vers le
  suivant **dans la même exécution**. Le worker queue retry 3x
  uniquement sur la chaîne complète qui a échoué.
- **Idempotence webhook** : un même `provider_message_id` reçu 2x → pas
  de doublon dans `delivery_attempts`.
- **Batch par opérateur** : si 50 numéros mixés (30 Orange, 20 Free) →
  30 appels Orange (1 par numéro, contrainte API) + 1 appel batch LAM
  pour les 20 Free (ou 1 appel Mtarget si LAM down).
- **Token caching Orange** : token OAuth caché en Redis avec TTL
  `expires_in - 60s` pour éviter de redemander à chaque envoi.

## Delta à produire

- [ ] Composer : pas de SDK provider — `guzzlehttp/guzzle` (déjà tiré
      par Laravel) + `propaganistas/laravel-phone` pour validation E.164.
- [ ] Interface : `App\Services\Notifications\Sms\SmsDriverInterface`
      avec signature `array|string $to`.
- [ ] DTO : `App\Services\Notifications\Sms\SmsResult` (avec
      `segments_count` et statut `deferred_to_fallback`).
- [ ] Service : `App\Services\Notifications\Sms\OperatorResolver`
      (résout opérateur depuis numéro + config prefixes).
- [ ] Service : `App\Services\Notifications\Sms\QuietHoursGuard`
      (Africa/Dakar 22h-06h, exempt 2FA).
- [ ] Service : `App\Services\Notifications\Sms\OrangeDailyCapTracker`
      (Redis, TTL 24h, clé par MSISDN).
- [ ] Service : `App\Services\Notifications\Sms\OrangeOAuthTokenCache`
      (Redis, TTL `expires_in - 60`).
- [ ] Drivers feuilles (3) : `OrangeSmsDriver`, `MtargetSmsDriver`,
      `LAfricaMobileSmsDriver`.
- [ ] Driver routeur : `SmsRouterDriver` (orchestration + fallback +
      quiet hours + cap Orange).
- [ ] Driver conservé : `LogSmsDriver` pour `local`/`testing`.
- [ ] Channel : `App\Notifications\Channels\SmsChannel` (utilise
      `SmsRouterDriver`).
- [ ] Trait : `Critical` sur les Notifications existantes (2FA, booking
      confirm, payment alert) → `shouldSendSms()` retourne true.
- [ ] Migration : `add_delivery_attempts_to_app_notifications` (si
      structure absente) — JSON array, statut inclut
      `deferred_to_fallback`.
- [ ] Migration : `add_sms_integration_types` (enum sur `Integration.type`
      pour `sms_orange`, `sms_mtarget`, `sms_lafricamobile` ; placeholders
      `sms_free`, `sms_expresso` réservés mais inactifs).
- [ ] Config : `config/sms.php` (operator_prefixes, fallback_chains,
      rate_limit, pricing[provider][destination], webhook_allowed_ips,
      quiet_hours, default_driver par env).
- [ ] Controllers webhook (3) : `Orange`, `Mtarget` (POST form),
      `LAM` (GET).
- [ ] Routes signées : `routes/api.php` →
      `/api/webhooks/sms/{provider}/status/{token}`.
- [ ] Middleware `RestrictIpMiddleware` (IP allowlist par provider
      depuis config).
- [ ] Rate limit middleware sur `SmsChannel` (avant routage, 5/h/user).
- [ ] Tests unitaires :
      - [ ] `OperatorResolverTest` (préfixes SN + non-SN).
      - [ ] `QuietHoursGuardTest` (22h-06h, exempt 2FA, timezone Dakar).
      - [ ] `OrangeDailyCapTrackerTest` (incrément, TTL, reset).
      - [ ] Un test par driver feuille (mock HTTP, codes erreur, batch
            comma-separated pour Mtarget, single recipient pour Orange).
      - [ ] `SmsRouterDriverTest` — groupage, fallback chain (failure +
            cap Orange + quiet hours), batch.
      - [ ] `SmsChannelTest` (opt-in / opt-out / non-critical).
      - [ ] Un `WebhookTest` par provider (path valide / IP valide ;
            path invalide / IP invalide → 403/404).
- [ ] Tests e2e : 2FA → SMS via fake driver (assertion sur la chaîne
      `delivery_attempts`).
- [ ] Doc : `docs/integrations/sms.md` :
      - setup par provider (Orange Sonatel approbation, Mtarget support,
        LAM contract, env vars, IP à allowlist),
      - mapping operator/préfixe, schéma de fallback,
      - rappel ARTP (heures, NINEA, opt-in),
      - note "Free SN / Expresso SN : routés via LAM/Mtarget tant qu'aucun
        contrat carrier-direct n'existe ; types `sms_free`/`sms_expresso`
        réservés pour activation future".

## Critères d'acceptation

- [ ] AC1 — Notification `critical=true` à un user opt-in SMS avec
      numéro `+22177...` (Orange) déclenche un appel `OrangeSmsDriver`
      (mock HTTP), pas LAM/Mtarget.
- [ ] AC2 — Numéro `+22176...` (Free) → direct `LAfricaMobileSmsDriver`,
      Orange jamais appelé.
- [ ] AC3 — Numéro `+22170...` ou `+22175...` (Expresso) → direct
      `LAfricaMobileSmsDriver`.
- [ ] AC4 — `OrangeSmsDriver` throw / 5xx → router enchaîne sur
      `LAfricaMobileSmsDriver` puis `MtargetSmsDriver`.
      `delivery_attempts` contient les 3 entrées dans l'ordre.
- [ ] AC5 — Numéro `+22177...` qui a déjà reçu 3 SMS Orange dans les
      24h → bascule directe sur LAM avec
      `failure_reason=orange_daily_cap_reached`, status
      `deferred_to_fallback` (pas `failed`).
- [ ] AC6 — Envoi non-2FA déclenché à 23h Africa/Dakar → différé en
      queue jusqu'à 06h, **aucun driver appelé**. Envoi 2FA à la même
      heure → exempté, envoi immédiat.
- [ ] AC7 — Numéro hors `+221` → bypass Orange, direct LAM puis
      Mtarget en fallback.
- [ ] AC8 — Agence n'a **pas** d'Integration `sms_orange` active mais
      a `sms_lafricamobile` → numéro Orange (77) routé direct sur LAM
      (skip step 1).
- [ ] AC9 — Aucune Integration SMS active sur l'agence →
      `delivery_attempts` marqué `failed` avec
      `failure_reason=no_provider_available`, email de fallback envoyé.
- [ ] AC10 — Notification non-critique → **jamais** d'envoi SMS, même
      opt-in.
- [ ] AC11 — User opt-out SMS → jamais de SMS, même critique.
- [ ] AC12 — Numéro malformé (non E.164) → 422 / rejeté avant routage,
      aucun driver appelé.
- [ ] AC13 — Rate limit applicatif dépassé (>5/h/user) → SMS différé/rejeté
      avec log, aucun driver appelé.
- [ ] AC14 — Batch de 50 numéros (30 Orange, 20 Free) → 30 appels
      unitaires Orange + 1 appel batch LAM (`msisdn` array de 20).
- [ ] AC15 — Webhook Orange avec IP non allowlistée → 403, status
      non modifié.
- [ ] AC16 — Webhook Mtarget avec `MsgId` inconnu → 404 silencieux.
- [ ] AC17 — Webhook LAM (GET) avec `push_id` valide → met à jour
      `delivery_attempts` correspondant en `delivered`.
- [ ] AC18 — Webhook reçu 2x avec même `provider_message_id` →
      idempotent, pas de doublon.
- [ ] AC19 — Token OAuth Orange caché en Redis : envoi #1 → POST
      `/oauth/v3/token`, envois suivants → réutilise token jusqu'à
      `expires_in - 60s`.
- [ ] AC20 — Désactiver `Integration sms_orange` en runtime → numéros
      Orange routés sur LAM sans redéploiement.

## Hors périmètre

- **Drivers carrier-direct Free SN (Yas) et Expresso SN** — pas d'API
  publique self-serve en 2026. Réactivables via tickets dédiés une fois
  un contrat B2B signé (probablement SMPP, pas REST). Les types
  `sms_free` et `sms_expresso` sur `Integration.type` sont réservés
  mais non câblés en v1.
- WhatsApp Business / autres canaux messaging (P3, ticket dédié).
- UI admin de gestion des Integration SMS multi-provider (couverte par
  TCK-064 ou ticket §31 dédié).
- Templates SMS multi-langues éditables par l'agence (P3 — texte en dur
  via `Lang` dans ce ticket).
- Stats consolidées de delivery / coût par provider (P3 — la donnée
  existe via `delivery_attempts` et ActivityLog).
- Détection MNP (Mobile Number Portability) — un `77...` porté vers Yas
  est supposé Orange ; en cas d'échec Orange, le fallback LAM/Mtarget
  prend le relais (acceptable en P2, monitoring runtime à prévoir).
- Choix dynamique du fallback selon coût / qualité par destination
  (P3 — pour l'instant ordre fixe par opérateur).
- Cost tracking dynamique en BDD avec rate-cards versionnés (P3 — config
  statique en v1).

## Notes d'implémentation

### Décisions non-évidentes

- **Pas de `propaganistas/laravel-phone`.** L'interface E.164 est
  servie par un mini-helper `App\Services\Notifications\Sms\PhoneNumber`
  (regex `^\+[1-9]\d{7,14}$` + extraction préfixe SN). Évite une
  nouvelle dépendance pour ~40 lignes de code. Si un parser plus strict
  devient nécessaire (parsing par pays / format E.164 long), le
  package se branche en `normalize()` sans toucher aux drivers.
- **Pas de migration `add_sms_integration_types`.** Le modèle
  `Integration` existant utilise `provider` (string) + `credentials`
  (encrypted array) + `metadata` (json). On y a écrit nos valeurs
  `sms_orange` / `sms_mtarget` / `sms_lafricamobile` directement —
  validation au niveau service via `config('sms.allowed_integration_providers')`.
  Les types `sms_free` et `sms_expresso` y figurent comme placeholders
  "réservés mais inactifs" (cf. § Hors périmètre). Pas d'enum DB pour
  rester compatible avec le schéma `provider:string` du modèle.
- **LAM driver = JSON loop, pas XML batch.** La doc LAMPUSH décrit
  deux modes : JSON unitaire ou XML multi-message. Le driver fait une
  requête HTTP par destinataire (JSON). AC14 reste vert : 30 numéros
  Orange → 30 calls Orange (contrainte API), 20 numéros Free → 20
  calls LAM (au lieu d'un batch XML). Le passage XML est trivial mais
  ajoute du parsing pour un gain marginal au volume v1 ; à activer si
  les coûts d'établissement TLS deviennent un problème.
- **Cap Orange pré-filtre dans le router, pas dans le driver.** Plus
  économe (pas de call HTTP qui sera de toute façon refusé), permet
  un statut `deferred_to_fallback` distinct de `failed` (les bypass
  par quota/quiet hours ne polluent pas les métriques d'erreur
  provider). Le driver reste idempotent : il pourrait être appelé
  unitairement sans le router et fonctionnerait quand même.
- **Quiet hours différé via `SendDeferredSmsJob` en queue.** En env
  `testing` (`QUEUE_CONNECTION=sync`), le job s'exécuterait synchrone
  et ré-entrerait le router immédiatement avec `bypass_quiet_hours=true`.
  Les tests de quiet hours utilisent `Queue::fake()` pour intercepter
  ce dispatch.
- **Webhook lookup en deux phases.** `delivery_attempts` est un JSON
  ; pour rester portable (SQLite en tests, MySQL en prod) le
  `DeliveryAttemptUpdater` filtre les candidats avec un `LIKE
  %provider_message_id%` puis scanne les entrées en PHP. Suffisant au
  volume v1 ; un index dédié (table séparée ou `JSON_VALUE` index)
  serait un suivi P3 si le throughput webhook devient critique.
- **LAM webhook = path signé Laravel.** La GET URL est générée par
  send via `URL::signedRoute(...)` et inclut `notification_id` ; cela
  fournit à la fois la signature et un lookup direct sans scan JSON.
- **`AppNotification` schema delta.** Une seule colonne ajoutée :
  `delivery_attempts json nullable`. Cast `array` ajouté au modèle.
  Les notifications existantes restent non impactées (NULL = aucun
  envoi SMS tracé).

### Fichiers touchés (inventaire)

- Migrations : `2026_04_26_160847_add_delivery_attempts_to_app_notifications.php`
- Config : `config/sms.php`
- Services : `App\Services\Notifications\Sms\` (interface, DTO,
  PhoneNumber, OperatorResolver, QuietHoursGuard, OrangeDailyCapTracker,
  OrangeOAuthTokenCache, IntegrationLocator, SmsSegmentCalculator,
  DeliveryAttemptUpdater, SmsRouterDriver) + `Drivers\` (Log, Orange,
  Mtarget, LAfricaMobile)
- Job : `App\Jobs\SendDeferredSmsJob`
- Channel : `App\Notifications\Channels\SmsChannel` + concerns
  `Critical` & `SupportsSms`
- Webhooks : `App\Http\Controllers\Webhook\` (3 controllers) +
  `App\Http\Middleware\RestrictIpMiddleware` + `routes/api/sms-webhooks.php`
- Bootstrap : `bootstrap/app.php` (alias `restrict.ip`),
  `app/Providers/AppServiceProvider.php` (singletons + `sms` channel)
- Modèle : `app/Models/AppNotification.php` (cast + fillable
  `delivery_attempts`)
- Factory : `database/factories/AppNotificationFactory.php` (nouvelle)
- Tests : 4 unit + 6 feature (50 tests, 120 assertions, vert)
- Doc : `docs/integrations/sms.md`

### Tests passés

```
php artisan test
> Tests: 1315 passed (3747 assertions)
```

(Nouveaux : 50 tests SMS — 0 régression sur les 1265 existants.)

### Suivi (P3, hors v1)

- Driver carrier-direct Free SN (Yas) / Expresso SN une fois un
  contrat B2B signé.
- Index dédié pour la lookup webhook si le throughput le justifie.
- LAM en mode XML batch si réduction des coûts TLS souhaitée.
- 5 TPS Orange — semaphore Redis encore non câblé (le cap 3/jour/MSISDN
  l'est).
