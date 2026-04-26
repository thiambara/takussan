# SMS Notifications — Operator Guide (TCK-102)

> **Audience.** Backend devs wiring a Notification, ops setting up a new
> agency, support investigating a delivery. The architecture is in
> [`docs/backlog/tickets/TCK-102-sms-notifications-driver.md`](../backlog/tickets/TCK-102-sms-notifications-driver.md).

## Quick model

```
SmsChannel
    │
    ▼
SmsRouterDriver  ──┬─▶  OrangeSmsDriver       (77, 78)
                   ├─▶  LAfricaMobileSmsDriver (76, 70, 75, foreign)
                   └─▶  MtargetSmsDriver      (any — last fallback)
```

The router groups recipients by operator (prefix lookup in
`config('sms.operator_prefixes')`), walks the per-operator fallback
chain (`config('sms.fallback_chains')`), and persists every step in
`AppNotification.delivery_attempts`. Quiet-hours and Orange daily-cap
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
  — set it to `https://api.takussan.app/api/webhooks/sms/mtarget/status/<token>`.
- `allowunicode=true` is sent automatically when the message contains
  non-ASCII chars.
- Negative codes (-1 … -15) are mapped to `mtarget_error_<code>` in
  `failure_reason`.

### LAfricaMobile (LAMPUSH v2.3)

- Sign a contract with LAM, who provisions the LAMPUSH host (default:
  `lampush-tls.lafricamobile.com`, override per-agency via
  `Integration.metadata.host`).
- Sender ID ≤ 11 alphanum, **must NOT start with a digit**.
- DLR is **GET** with query params `push_id`, `ret_id`, `to`,
  `status`, `text`. Each send embeds a **per-message signed return
  URL** that includes the `AppNotification.id` for fast lookup.

## Inbound webhook security

Aucun provider n'expose de signature HMAC. La sécurité repose sur :

1. **Path obscur signé** — `/api/webhooks/sms/{provider}/status/{token}`
   où `{token}` est `config('sms.webhook_url_token')`. Rotater en cas
   de compromission, mettre à jour le dashboard du provider.
2. **IP allowlist** — `RestrictIpMiddleware` (alias `restrict.ip:{provider}`)
   lit `config('sms.webhook_allowed_ips.{provider}')`. Vide ⇒ pas de
   filtrage (utile uniquement en `local` / `testing`).
3. **Matching `provider_message_id`** — un payload qui ne pointe sur
   aucune ligne de `delivery_attempts` retourne **404 silencieux**,
   pas 200.
4. **Idempotence** — la même paire `(provider, provider_message_id,
   status)` reçue plusieurs fois ne crée qu'une seule entrée
   `delivered`.
5. **LAM** — en plus, signature Laravel `signed` (signed-route) car
   l'URL est unique par message.

## Réglementation ARTP

Applicable à **tous** les drivers, sans exception (loi sénégalaise) :

- **Heures de silence 22h–06h Africa/Dakar.** SMS commerciaux
  interdits ; les transactionnels critiques (2FA, OTP, security alerts
  — flag `Critical`/`isCriticalSms()=true`) sont **exemptés**. Le reste
  est différé jusqu'à 06h via `SendDeferredSmsJob`.
- **Opt-in obligatoire pour le marketing.** Géré par `NotificationPreference`
  (TCK-070).
- **NINEA + RCCM requis depuis janvier 2025** (Loi 2018-28, Art. 36)
  pour souscrire un compte SMS business — à fournir lors de
  l'onboarding d'une `Integration`.

## Écrire une Notification SMS

```php
use App\Notifications\Concerns\Critical;
use App\Notifications\Concerns\SupportsSms;
use Illuminate\Notifications\Notification;

class TwoFactorCodeNotification extends Notification implements SupportsSms
{
    use Critical; // bypass quiet hours + opt-in

    public function __construct(public string $code) {}

    public function via(object $notifiable): array
    {
        return ['sms'];
    }

    public function toSms(object $notifiable): string
    {
        return "Takussan code: {$this->code}";
    }

    public function smsEventType(): string
    {
        // Must match a PreferenceResolver::EVENTS entry for non-critical
        // notifications. Critical notifications can use any string —
        // the channel skips the preference check anyway.
        return 'security_alert';
    }
}
```

For non-critical notifications, drop the `Critical` trait and
implement `shouldSendSms()` + `isCriticalSms()` returning `false`. The
channel will then enforce opt-in and the quiet-hours window.

Optional hook: `appNotificationIdFor($notifiable): ?int` lets you
attach the send to an `AppNotification` row so its `delivery_attempts`
gets populated automatically.

## Operational checklist

- [ ] Set `SMS_WEBHOOK_URL_TOKEN` to a fresh
      `Str::random(40)` per env. Rotate on compromise.
- [ ] For each agency, create the relevant `Integration` rows
      (`sms_orange`, `sms_mtarget`, `sms_lafricamobile`) with
      encrypted credentials.
- [ ] Configure provider dashboards with the static webhook URLs
      (Mtarget) and the per-message signed URL pattern (Orange — same
      static URL form; LAM — generated per send).
- [ ] Add provider source IPs to `SMS_*_WEBHOOK_IPS` env vars.
- [ ] Toggle `Integration.is_active=false` to drain a provider — the
      router skips it on the next send without redeploy (AC20).
- [ ] Monitor `delivery_attempts` JSON for `failure_reason` patterns
      and `deferred_to_fallback` rates per provider.
