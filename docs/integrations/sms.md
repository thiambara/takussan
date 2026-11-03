# SMS Notifications — Operator Guide (TCK-102)

> **Relu contre le code le 2026-11-03** (`config/sms.php`, `app/Services/Notifications/Sms/`,
> `routes/api/sms-webhooks.php`, `app/Notifications/CodedNotification.php`). Les numéros de ligne
> cités sont ceux de ce jour.
>
> **Audience.** Backend devs wiring a Notification, ops setting up a new
> agency, support investigating a delivery. The architecture is in
> [`docs/backlog/tickets/done/TCK-102-sms-notifications-driver.md`](../backlog/tickets/done/TCK-102-sms-notifications-driver.md).

## Quick model

```
SmsChannel
    │
    ▼
SmsRouterDriver  ──┬─▶  OrangeSmsDriver       (77, 78)
                   ├─▶  LAfricaMobileSmsDriver (76, 70, 75, foreign)
                   └─▶  MtargetSmsDriver      (any — last fallback)
                  (└─▶  LogSmsDriver          local/testing seulement, voir « Développement local »)
```

The router groups recipients by operator (prefix lookup in
`config('sms.operator_prefixes')`), walks the per-operator fallback
chain (`config('sms.fallback_chains')`), and persists every step as a
row of the **`notification_delivery_attempts`** table
(`NotificationDeliveryAttempt`, TCK-110). ⚠ The legacy JSON column
`app_notifications.delivery_attempts` has had **no writer since TCK-110**
(`SmsRouterDriver.php:17-21`) and left `$fillable` with TCK-1020
(`AppNotification.php:22-24`); its removal awaits a preproduction measure. Quiet-hours and Orange daily-cap
checks happen upstream of the leaf drivers — when they trip, the
attempt is recorded as `deferred_to_fallback` (not `failed`) so
provider error dashboards stay accurate.

## Routing

| Préfixe (after +221) | Operator   | Primary            | Fallback 1          | Fallback 2 |
|----------------------|------------|--------------------|---------------------|------------|
| 77, 78               | Orange SN  | OrangeSmsDriver    | LAfricaMobile       | Mtarget    |
| 76                   | Free SN    | LAfricaMobile      | Mtarget             | —          |
| 70, 75               | Expresso   | LAfricaMobile      | Mtarget             | —          |
| Any other prefix     | —          | LAfricaMobile      | Mtarget             | —          |

> **Free SN (Yas) and Expresso SN do not expose self-serve APIs.**
> Their MSISDNs are routed via aggregators (LAM → Mtarget) which
> terminate on those carriers via commercial agreements. The
> `Integration.provider` enum reserves `sms_free` and `sms_expresso`
> for future B2B contracts (likely SMPP, not REST).

## Setup per provider

### Orange Sénégal

- Sign up on `developer.orange.com` and request *SMS Sénégal* product
  access. Sonatel approval is local and may take days.
- Provide a **real Orange SN SIM card** as `senderAddress`
  (`tel:+221XXXXXXXXX`).
- Whitelist the alphanumeric `senderName` (≤ 11 chars) — Orange takes
  ~10 working days.
- Hard limits enforced by our router:
  - **5 TPS** (semaphore — to be added when traffic justifies it).
  - **3 SMS / day / MSISDN** (Redis counter, key
    `sms:orange:cap:{e164}`, TTL 24h).
- OAuth 2.0 client_credentials. Tokens are cached per
  `Integration.id` with TTL `expires_in - 60s`.
- Country-locked **+221** (interconnects with all SN MNOs via
  Sonatel).
- `Integration.credentials` schema:
  ```json
  {
    "client_id": "…",
    "client_secret": "…",
    "sender_address": "tel:+22177XXXXXXX",
    "sender_name": "TAKUSSAN"
  }
  ```

### Mtarget

- Sign up on `mtarget.fr` and ask support for the SMS endpoint
  (`api-public-2.mtarget.fr/messages` is current).
- Auth credentials live in the **request body** (form-urlencoded), not
  in headers.
- Batch up to **500 numbers per call** via comma-separated `msisdn`.
- Sender ID ≤ 11 alphanum (numeric refused on Orange/Expresso SN).
- DLR is configured at the **account level** in the Mtarget dashboard
  — set it to `https://api.takussan.com/api/webhooks/sms/mtarget/status/<token>`
  (préproduction : `https://preview.api.takussan.com/…`), où `<token>` est le
  jeton de Mtarget (`SMS_MTARGET_WEBHOOK_URL_TOKEN`, sinon la clé commune —
  P36.04, TCK-943).
- `allowunicode=true` is sent automatically when the message contains
  non-ASCII chars.
- Negative codes (-1 … -15) are mapped to `mtarget_error_<code>` in
  `failure_reason`.

### LAfricaMobile (LAMPUSH v2.3)

- Sign a contract with LAM, who provisions the LAMPUSH host (default:
  `lampush-tls.lafricamobile.com`, `config/sms.php:258`). An override is read from
  `credentials.host`, then `metadata.host` of the `Integration`, **and only kept if it is
  `https` on `lafricamobile.com` or a `*.lafricamobile.com` subdomain**; any other host is
  rejected, logged (`[sms.lam] rejected non-allowlisted host override`) and the default is used
  (`LAfricaMobileSmsDriver.php:153-177`, SSRF hardening of TCK-110).
- Sender ID ≤ 11 alphanum, **must NOT start with a digit**.
- DLR is **GET** with query params `push_id`, `ret_id`, `to`,
  `status`, `text`. Each send embeds a **per-message signed return
  URL** that includes the `AppNotification.id` for fast lookup.

## Inbound webhook security

Aucun provider n'expose de signature HMAC. La sécurité repose sur :

1. **Path obscur signé** — `POST /api/webhooks/sms/{orange|mtarget}/status/{token}` et, pour LAM,
   `GET /api/webhooks/sms/lafricamobile/status/{token}/{notification}` (`routes/api/sms-webhooks.php:24-36`),
   où `{token}` est le jeton **du fournisseur**
   (`config('sms.webhook_url_tokens.{provider}')` : `SMS_ORANGE_WEBHOOK_URL_TOKEN`,
   `SMS_MTARGET_WEBHOOK_URL_TOKEN`, `SMS_LAM_WEBHOOK_URL_TOKEN`), sinon la clé
   commune `SMS_WEBHOOK_URL_TOKEN`, gardée le temps de la bascule (P36.04,
   TCK-943). Posé, le jeton d'un fournisseur est le seul accepté sur sa route :
   celui que LAM reçoit dans chaque `ret_url` n'ouvre ni Orange ni Mtarget.
   Rotater en cas de compromission, mettre à jour le dashboard **de ce seul**
   provider.
2. **IP allowlist** — `RestrictIpMiddleware` (alias `restrict.ip:{provider}`)
   lit `config('sms.webhook_allowed_ips.{provider}')`. Vide en
   production ⇒ **403 fail-closed** (durci par TCK-102). Vide en
   `local`/`testing` ⇒ filtrage désactivé.
3. **Matching `(provider, provider_message_id)`** — un payload qui ne
   pointe sur aucune ligne de `notification_delivery_attempts` (TCK-110)
   retourne **404 silencieux**, pas 200. L'index unique
   `(provider, provider_message_id)` empêche les collisions de type
   `mtg-77` ↔ `mtg-770`.
4. **Idempotence** — la même paire `(provider, provider_message_id,
   status)` reçue plusieurs fois ne crée qu'une seule entrée
   `delivered`.
5. **LAM** — en plus, signature Laravel `signed` (signed-route) car
   l'URL est unique par message. Elle **expire** : `SMS_LAM_DLR_SIGNATURE_TTL_DAYS` jours
   (défaut 7, au moins 1 — `config/sms.php:264`, `LAfricaMobileSmsDriver.php:140-144`, P36.08,
   TCK-945). Un accusé arrivé après ce délai est refusé (« Invalid signature »).

### Posture Mtarget — HMAC absent (résidu de risque documenté)

L'API Mtarget v2 (Mtarget Public API, _SMSPRO_) documente le DLR comme
un POST form-urlencoded vers une URL configurée au niveau du compte.
**Aucune signature HMAC ni en-tête de vérification de payload n'est
exposée par le provider** au moment de l'investigation TCK-110
(2026-04-26). Les options Mtarget couvrent uniquement la liste
d'origines IP (annoncée dans la doc dev.mtarget.fr) et le path token
choisi par l'intégrateur. Conséquence opérationnelle :

- **IP allowlist obligatoire en production.** `config('sms.webhook_allowed_ips.mtarget')`
  doit être renseigné avec les ranges d'expédition Mtarget. Le
  middleware `restrict.ip:mtarget` renvoie `403` si la liste est vide
  en environnement `production`.
- **Risque résiduel.** Un attaquant disposant à la fois (a) du token
  de path — placé dans `SMS_MTARGET_WEBHOOK_URL_TOKEN` (sinon
  `SMS_WEBHOOK_URL_TOKEN`), jamais loggé — et (b)
  d'une IP usurpée dans le range Mtarget pourrait forger un DLR. Cas
  ramené à un mauvais `provider_message_id` ⇒ 404, et même un match
  réussi ne ferait que basculer une entrée `sent` en `delivered` sur
  un message déjà parti (pas d'effet de bord financier ou de fuite).
- **Si Mtarget publie une signature de payload dans une révision
  ultérieure de l'API**, le câblage se fait dans
  `MtargetSmsStatusController::__invoke` après validation du token
  et avant le lookup `applyStatus`.

### Accusés Mtarget tirés plutôt que reçus (TCK-294)

La parade au risque résiduel ci-dessus existe : **c'est nous qui appelons Mtarget** (« API Pulling
DLR / MO »), avec les identifiants du compte — il n'y a plus rien d'entrant à authentifier.

- Commande `sms:pull-mtarget-dlr` (`app/Console/Commands/SmsPullMtargetDlr.php`), planifiée
  toutes les 5 minutes (`routes/console.php:188`). Options `--agency`, `--max`, `--batches`.
- Interrupteurs (`config/sms.php:220-233`) : `SMS_DLR_PULL_DRIVER` (`log` par défaut, `mtarget`
  pour le vrai), `SMS_DLR_PULL_ENABLED` (`false` par défaut : la commande ne fait rien),
  `SMS_DLR_PULL_MAX` (50 par appel), `SMS_DLR_PULL_MAX_BATCHES` (20 appels par passage),
  `SMS_MTARGET_PULL_URL`.
- La lecture est **destructive** chez Mtarget : l'idempotence est côté écriture
  (`DlrReportApplier` : mise à jour seule, par `(provider, provider_message_id)`, sans régression
  de statut). Un appel en échec arrête la vidange.
- Le webhook reste ouvert pendant le recouvrement : `SMS_MTARGET_WEBHOOK_ENABLED=false`
  (`config/sms.php:254`) le fait répondre 404 (`MtargetSmsStatusController.php:53`), sans
  déploiement. À faire une fois le tirage observé.

## Réglementation ARTP

Applicable à **tous** les drivers, sans exception (loi sénégalaise) :

- **Heures de silence 22h–06h Africa/Dakar.** SMS commerciaux
  interdits ; les transactionnels critiques (2FA, OTP, security alerts
  — `isCriticalSms()=true`) sont **exemptés**. Le reste
  est différé jusqu'à 06h via `SendDeferredSmsJob`.
- **Opt-in obligatoire pour le marketing.** Géré par `NotificationPreference`
  (TCK-070).
- **NINEA + RCCM requis depuis janvier 2025** (Loi 2018-28, Art. 36)
  pour souscrire un compte SMS business — à fournir lors de
  l'onboarding d'une `Integration`.

## Écrire une Notification SMS

**Le patron du dépôt est la notification par code** (ADR-0032, TCK-588) : l'API n'écrit pas de
prose, elle émet un `NotificationCode` et ses paramètres bruts ; le texte vient de
`lang/{fr,en,wo}/notifications.php` → `codes.<code>.sms`, ou d'un gabarit actif du super-admin
(`NotificationRenderer.php:16-25,122-124`). On n'écrit donc pas de classe : on déclare le code
(`app/Domain/Notifications/NotificationCode.php`, `mobile()` pour qu'il puisse partir par WhatsApp
ou SMS, `preferenceEvent()` pour l'interrupteur de préférence) et ses textes, puis on l'envoie :

```php
// app/Http/Controllers/Api/MaintenanceRequestController.php:164
$this->notifications->send($owner, NotificationCode::MaintenanceCreated, [ /* paramètres bruts */ ]);
```

`NotificationService::send()` écrit la ligne `app_notifications`, puis met en file un
`CodedNotification`, qui choisit **un seul** canal mobile — WhatsApp s'il est permis, sinon SMS
(`CodedNotification.php:167-199`) — et rend le SMS dans la langue du destinataire
(`toSms()`, ligne 269). Il n'est **pas critique** (`isCriticalSms()` → `false`, ligne 279) : le
canal applique l'opt-in et les heures de silence.

**Un code à usage unique** (OTP, signature) reste une classe dédiée, critique, qui implémente
`App\Notifications\Concerns\SupportsSms` — exemple réel : `LeaseSignatureCodeNotification`
(`toSms()` ligne 74, `isCriticalSms()` → `true` ligne 88). Son texte passe aussi par `lang/`
(`__('notifications.lease_signature_code.sms', …)`), jamais en dur.

L'interface ne porte que trois méthodes (`SupportsSms.php:16-23`) : `toSms()`, `shouldSendSms()`,
`isCriticalSms()`. Deux autres sont **facultatives**, lues par `method_exists`
(`SmsChannel.php:158-176`) :

- `smsEventType(): string` — l'événement de préférence (`PreferenceResolver::EVENTS`) d'une
  notification non critique ; ⚠ absent, le canal tient le destinataire pour inscrit
  (`SmsChannel.php:181-191`) — une notification non critique sans lui ignorerait l'opt-out. Défaut
  latent : aucune des sept notifications SMS n'est touchée au 2026-11-03 (critiques, ou
  `CodedNotification`) ; le fermer par défaut est [TCK-2464](../backlog/tickets/todo/TCK-2464-sms-opt-out-ferme-par-defaut.md) ;
- `appNotificationIdFor($notifiable): ?int` — rattache les tentatives à la ligne
  `app_notifications`, dans la table `notification_delivery_attempts`. `CodedNotification` les
  porte toutes deux (lignes 306 et 345).

## Operational checklist

- [ ] Set `SMS_ORANGE_WEBHOOK_URL_TOKEN`, `SMS_MTARGET_WEBHOOK_URL_TOKEN`
      and `SMS_LAM_WEBHOOK_URL_TOKEN` to three distinct fresh
      `Str::random(40)` per env (P36.04, TCK-943). Rotate on compromise.
      `SMS_WEBHOOK_URL_TOKEN` is only the fallback while they are unset.
- [ ] Create the **platform** `Integration` rows (`agency_id` null) —
      `sms_orange`, `sms_mtarget`, `sms_lafricamobile` — with encrypted
      credentials. Since TCK-765, an agency without its own row falls back
      on the platform's: ADR-0032 puts the SMS cost on the platform
      (`IntegrationLocator.php:13-16,23-31`). A per-agency row is optional
      and wins for that agency; the agency is the one of the notified
      object (TCK-2161, `NotificationService.php:64-67`).
- [ ] Configure provider dashboards with the static webhook URLs
      (Mtarget) and the per-message signed URL pattern (Orange — same
      static URL form; LAM — generated per send).
- [ ] Add provider source IPs to `SMS_*_WEBHOOK_IPS` env vars.
- [ ] Toggle `Integration.is_active=false` to drain a provider — the
      router skips it on the next send without redeploy (AC20).
- [ ] Monitor the `notification_delivery_attempts` table for
      `failure_reason` patterns and `deferred_to_fallback` rates per
      provider (the `app_notifications.delivery_attempts` JSON column is
      no longer written, TCK-110).

## Repli WhatsApp → SMS (TCK-766, TCK-1092)

`CodedNotification` ne prend qu'**un** canal mobile ; quand c'est WhatsApp, le SMS en est le repli.

- **Immédiat** (`WhatsappChannel.php:35-56,124,144`) : destinataire non éligible (opt-out, fenêtre
  de 24 h fermée sans gabarit) ou **échec sûr** rendu par l'appel → le message repart par le
  routeur SMS. Jamais sur un échec **ambigu** (délai, 5xx : Meta a pu l'accepter), qui le ferait
  recevoir deux fois (TCK-766).
- **Tardif** (`SendSmsAfterLateWhatsappFailureJob`, TCK-1092) : Meta accepte, puis son accusé dit
  `failed`. Le SMS ne part qu'une fois, pour une notification par code, si aucune tentative SMS
  n'existe déjà, si la notification le permet (`smsFallbackAllowed()`, TCK-599), **hors** heures de
  silence (il n'est pas reporté : il ne part pas) et si l'accusé arrive moins d'une heure après
  l'envoi.

## Plafonds et limites (`config/sms.php`)

| Clé d'environnement | Défaut | Effet |
|---|---|---|
| `SMS_OTP_ALLOWED_COUNTRY_CODES` | `221` | indicatifs servis pour un code ; hors liste, 422 `phone_country_not_allowed` et rien ne part (`config/sms.php:99-102`, `PhoneVerificationController.php:62`) |
| `SMS_OTP_DAILY_CAP` | `2000` | plafond **global** de codes par jour UTC, contre le « SMS pumping » ; atteint, plus rien ne part jusqu'au lendemain (ligne 103, `PhoneVerificationService.php:371-380`) |
| `SMS_INVITATION_DAILY_CAP_PER_AGENCY` | `50` | SMS d'invitation par agence et par jour UTC ; atteint, 429 `invitation.sms_daily_cap_reached` (ligne 110) |
| `SMS_RATE_LIMIT_PER_USER_HOUR` | `5` | SMS par utilisateur et par heure, avant tout pilote (ligne 117, `SmsChannel.php:202`) |
| `SMS_QUIET_HOURS_ENABLED` | `true` | heures de silence ARTP 22 h – 6 h Africa/Dakar (lignes 125-130) |

L'Orange **5 TPS** (`tps_limit`, ligne 198) n'est lue par aucun code au 2026-11-03 ; seul le plafond
de 3 SMS par jour et par numéro est appliqué (`OrangeDailyCapTracker`).

## Développement local et préproduction

- **Pilote `log` (TCK-589)** : `SMS_LOG_FALLBACK=true` termine chaque chaîne par `log`
  (`LogSmsDriver`), qui écrit le SMS — et le code qu'il porte — dans le journal au lieu de le
  perdre. Il n'agit que si `APP_ENV` vaut `local` ou `testing` (`config/sms.php:38-49`) :
  recopiée en préproduction ou en production, la clé ne fait rien. `.env.docker` la pose,
  `phpunit.xml` la force à faux.
- **Aperçu du code (ADR-0060, TCK-620)** : `OTP_PREVIEW_ENABLED=true` (`config/auth.php:172`)
  renvoie aussi le code envoyé dans la réponse, sous `otp_preview`, si `APP_ENV` est `local`,
  `staging` ou `testing` (`OtpPreview.php:28-36`). Le SMS part quand même. L'API refuse de démarrer
  avec le drapeau allumé sur l'origine de production (`OtpPreview.php:42-52`, P71.02). Posé en
  préproduction depuis le 2026-10-10 ; **à éteindre avant qu'elle reçoive des données réelles**
  (`docs/infra/hebergement.md`).
