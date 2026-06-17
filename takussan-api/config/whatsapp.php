<?php

/**
 * TCK-282 — WhatsApp Cloud API (Meta) outbound channel configuration.
 *
 * Mono-provider mirror of config/sms.php: a single Meta endpoint, no
 * per-operator routing and no quiet hours (WhatsApp is asynchronous).
 * The channel routes WhatsApp-first and falls back to SMS, so the SMS
 * stack remains the delivery safety net.
 */

return [

    /**
     * Active driver: `cloud` talks to the Meta Graph API, `log` is a
     * no-network stub used in local/testing. Mirror of sms.default_driver.
     */
    'default_driver' => env('WHATSAPP_DEFAULT_DRIVER', 'cloud'),

    /**
     * Graph API base URI (pinned version). Send calls hit
     * `{base_uri}/{phone_number_id}/messages`.
     */
    'base_uri' => env('WHATSAPP_BASE_URI', 'https://graph.facebook.com/v21.0'),

    /**
     * Integration.provider value used to look up the agency (or global)
     * credentials: phone_number_id + access_token in `credentials`,
     * webhook verify token + app secret in `metadata`.
     */
    'integration_provider' => 'whatsapp_cloud',

    /**
     * Meta service window: free-form text is only allowed within this many
     * hours of the contact's last inbound message. Outside it, an approved
     * template is mandatory (Meta policy).
     */
    'service_window_hours' => 24,

    /**
     * Application-level rate limit applied before the provider is called.
     * Critical notifications bypass it (AC7).
     */
    'rate_limit' => [
        'per_user_per_hour' => env('WHATSAPP_RATE_LIMIT_PER_USER_HOUR', 10),
    ],

    /**
     * Random secret embedded in the status webhook URL — rotated on
     * credential compromise. Generated via `Str::random(40)`. (TCK-283)
     */
    'webhook_url_token' => env('WHATSAPP_WEBHOOK_URL_TOKEN', ''),

    /**
     * Meta app secret used to verify the `X-Hub-Signature-256` header on
     * inbound status webhooks. When empty, signature verification is
     * skipped (local/testing only). (TCK-283)
     */
    'webhook_app_secret' => env('WHATSAPP_WEBHOOK_APP_SECRET', ''),

    /**
     * Optional IP allowlist for the inbound DLR webhook. Empty disables
     * filtering (local/testing). Comma-separated env value. (TCK-283)
     */
    'webhook_allowed_ips' => array_filter(explode(',', (string) env('WHATSAPP_WEBHOOK_IPS', ''))),

];
