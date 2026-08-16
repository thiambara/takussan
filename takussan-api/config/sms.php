<?php

/**
 * TCK-102 — Multi-provider SMS routing configuration.
 *
 * Operator detection is prefix-based on E.164 numbers. Drivers and
 * fallback chains are listed by operator. Pricing is a static rate
 * card per (provider, destination_operator) pair. ARTP quiet hours
 * apply to all providers; only 2FA/OTP-tagged notifications are
 * exempt and sent immediately.
 */

return [

    'default_driver' => env('SMS_DEFAULT_DRIVER', 'router'),

    /**
     * Senegal mobile-operator prefix map. Two leading digits after the
     * country code (+221). Numbers outside this map are routed via the
     * "default" chain — see fallback_chains below.
     */
    'operator_prefixes' => [
        '+221' => [
            '77' => 'orange',
            '78' => 'orange',
            '76' => 'free',
            '70' => 'expresso',
            '75' => 'expresso',
        ],
    ],

    /**
     * Per-operator fallback chain. The router calls drivers in order
     * until one returns `sent`. `failed` and `deferred_to_fallback`
     * both trigger the next driver in the chain in the same execution.
     */
    'fallback_chains' => [
        'orange' => ['orange', 'lafricamobile', 'mtarget'],
        'free' => ['lafricamobile', 'mtarget'],
        'expresso' => ['lafricamobile', 'mtarget'],
        'default' => ['lafricamobile', 'mtarget'],
    ],

    /**
     * Mapping driver-id → Integration.provider value used to look up
     * credentials in the agency's Integration rows.
     */
    'integration_providers' => [
        'orange' => 'sms_orange',
        'mtarget' => 'sms_mtarget',
        'lafricamobile' => 'sms_lafricamobile',
        'free' => 'sms_free',
        'expresso' => 'sms_expresso',
    ],

    /**
     * Whitelist used when validating Integration.provider on save.
     * `sms_free` and `sms_expresso` are reserved for future B2B contracts
     * (see ticket "Hors périmètre"); they cannot drive sends today.
     */
    'allowed_integration_providers' => [
        'sms_orange',
        'sms_mtarget',
        'sms_lafricamobile',
        'sms_free',
        'sms_expresso',
    ],

    'active_integration_providers' => [
        'sms_orange',
        'sms_mtarget',
        'sms_lafricamobile',
    ],

    /**
     * Application-level rate limit applied before any driver is called.
     * Protects against abuse of 2FA / password reset endpoints.
     */
    'rate_limit' => [
        'per_user_per_hour' => env('SMS_RATE_LIMIT_PER_USER_HOUR', 5),
    ],

    /**
     * ARTP quiet hours (Africa/Dakar). Critical / 2FA notifications
     * — those whose Notification class returns `shouldSendSms()=true`
     * with `isCriticalSms()=true` — bypass this window.
     */
    'quiet_hours' => [
        'enabled' => env('SMS_QUIET_HOURS_ENABLED', true),
        'timezone' => 'Africa/Dakar',
        'start_hour' => 22,
        'end_hour' => 6,
    ],

    /**
     * Static rate-card. cost_estimate = segments_count × rate.
     * destination is the resolved operator; `default` covers non-+221
     * and unknown prefixes.
     */
    'pricing' => [
        'orange' => [
            'orange' => 0.030,
            'free' => 0.045,
            'expresso' => 0.045,
            'default' => 0.060,
        ],
        'mtarget' => [
            'orange' => 0.040,
            'free' => 0.040,
            'expresso' => 0.040,
            'default' => 0.050,
        ],
        'lafricamobile' => [
            'orange' => 0.038,
            'free' => 0.038,
            'expresso' => 0.038,
            'default' => 0.048,
        ],
    ],

    /**
     * Per-provider IP allowlist for inbound DLR webhooks. Empty array
     * disables IP filtering (only useful in `local` / `testing`).
     * Comma-separated env value, e.g. `1.2.3.4,5.6.7.8`.
     */
    'webhook_allowed_ips' => [
        'orange' => array_filter(explode(',', (string) env('SMS_ORANGE_WEBHOOK_IPS', ''))),
        'mtarget' => array_filter(explode(',', (string) env('SMS_MTARGET_WEBHOOK_IPS', ''))),
        'lafricamobile' => array_filter(explode(',', (string) env('SMS_LAM_WEBHOOK_IPS', ''))),
    ],

    /**
     * Random secret embedded in the webhook URL — rotated on credential
     * compromise. Provider-side dashboards must be updated when this
     * value changes. Generated via `php artisan tinker` → Str::random(40).
     */
    'webhook_url_token' => env('SMS_WEBHOOK_URL_TOKEN', ''),

    /**
     * Orange-specific runtime constraints (T&C of api.orange.com/sms-sn).
     */
    'orange' => [
        'oauth_token_url' => env('SMS_ORANGE_OAUTH_URL', 'https://api.orange.com/oauth/v3/token'),
        'send_url' => env('SMS_ORANGE_SEND_URL', 'https://api.orange.com/smsmessaging/v1/outbound/{senderAddress}/requests'),
        'tps_limit' => 5,
        'daily_cap_per_msisdn' => 3,
        'oauth_token_safety_margin_seconds' => 60,
    ],

    /**
     * TCK-294 — Delivery reports pulled by us instead of pushed to us.
     *
     * Mtarget emits no signature on its webhooks (ardoise D-49) and
     * recommends its "API Pulling DLR / MO" instead: our server calls the
     * operator with the account credentials, so there is nothing inbound
     * left to authenticate. The read is destructive on Mtarget's side —
     * a successful call empties the queue it returns — which is why
     * idempotence lives on the write side (see DlrReportApplier) and not
     * on a replayable time window.
     *
     * `driver` follows the repo's driver/registry pattern: `log` is the
     * inert default so a fresh checkout never talks to the operator;
     * `mtarget` is the real one. `enabled` is the operational off switch,
     * kept separate from the driver choice so production can stop pulling
     * without redeploying a different driver.
     */
    'dlr_pulling' => [
        'driver' => env('SMS_DLR_PULL_DRIVER', 'log'),
        'enabled' => env('SMS_DLR_PULL_ENABLED', false),

        /**
         * `max` sent to the operator on each call — Mtarget defaults to 50
         * when the parameter is omitted. `max_batches` bounds one run:
         * a single scheduled tick drains at most max_per_call × max_batches
         * reports, so a backlog cannot make one run last forever and trip
         * `withoutOverlapping()` on the next ticks.
         */
        'max_per_call' => (int) env('SMS_DLR_PULL_MAX', 50),
        'max_batches' => (int) env('SMS_DLR_PULL_MAX_BATCHES', 20),
    ],

    'mtarget' => [
        'send_url' => env('SMS_MTARGET_SEND_URL', 'https://api-public-2.mtarget.fr/messages'),
        'batch_max' => 500,

        /**
         * TCK-294 — API Pulling DLR/MO endpoint. `?:` rather than an env()
         * default because a key declared empty in `.env` yields `''`, not
         * the fallback.
         */
        'pull_url' => env('SMS_MTARGET_PULL_URL') ?: 'https://api-public-2.mtarget.fr/notification',

        /**
         * TCK-294 — Kill switch for the inbound (unauthenticatable) DLR
         * webhook. It stays ON during the overlap period documented in the
         * ticket: pulling must be observed to return the same statuses
         * before the push path is switched off. Flipping this to `false`
         * makes the route answer 404 — the retirement is a config change,
         * reversible in seconds, not a deploy.
         */
        'webhook_enabled' => env('SMS_MTARGET_WEBHOOK_ENABLED', true),
    ],

    'lafricamobile' => [
        'send_url' => env('SMS_LAM_SEND_URL', 'https://lampush-tls.lafricamobile.com/api/Send'),
    ],

];
