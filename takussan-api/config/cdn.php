<?php

return [

    /*
    |--------------------------------------------------------------------------
    | CDN enabled
    |--------------------------------------------------------------------------
    | When false every URL stays on local storage — identical behaviour to
    | the pre-TCK-105 state.  Flip to true once the CDN is provisioned.
    */
    'enabled' => (bool) env('CDN_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | Active provider
    |--------------------------------------------------------------------------
    | Supported: "bunny", "cloudflare"
    */
    'provider' => env('CDN_PROVIDER', 'bunny'),

    /*
    |--------------------------------------------------------------------------
    | CDN base URL
    |--------------------------------------------------------------------------
    | Public pull-zone URL, e.g. "https://takussan.b-cdn.net".
    | Trailing slash optional — the driver normalises it.
    */
    'base_url' => env('CDN_BASE_URL', ''),

    /*
    |--------------------------------------------------------------------------
    | Pull-zone name (Bunny only)
    |--------------------------------------------------------------------------
    */
    'pull_zone' => env('CDN_PULL_ZONE', ''),

    /*
    |--------------------------------------------------------------------------
    | Token Authentication signing key
    |--------------------------------------------------------------------------
    | Used by BunnyCdnDriver to sign private URLs (HMAC-SHA256).
    | Rotate via double-key window — see docs/infra/cdn.md.
    */
    'signing_key' => env('CDN_SIGNING_KEY', ''),

    /*
    |--------------------------------------------------------------------------
    | Signed URL TTL (seconds)
    |--------------------------------------------------------------------------
    | Default 300 s (5 min) — applies to secure collections.
    */
    'signature_ttl' => (int) env('CDN_SIGNATURE_TTL', 300),

    /*
    |--------------------------------------------------------------------------
    | Default format chain
    |--------------------------------------------------------------------------
    | Ordered list of formats the driver tries when negotiating via Accept.
    | BunnyCdnDriver appends ?format=<fmt> when the Accept header matches.
    */
    'default_format_chain' => ['avif', 'webp', 'jpeg'],

    /*
    |--------------------------------------------------------------------------
    | Secure collections
    |--------------------------------------------------------------------------
    | Media belonging to these Spatie collection names will always receive
    | a signed URL regardless of auth state.  For publicly accessible
    | collections no signing is applied.
    */
    'secure_collections' => [
        'lease_documents',
        'contract_documents',
        'property_archived_photos',
    ],

    /*
    |--------------------------------------------------------------------------
    | Health / circuit-breaker
    |--------------------------------------------------------------------------
    | threshold : consecutive errors within the rolling window before the
    |             circuit opens (stops forwarding to CDN).
    | cooldown  : seconds to keep the circuit open before retrying.
    | window    : rolling window in seconds for the error counter.
    */
    'health' => [
        'threshold' => (int) env('CDN_HEALTH_THRESHOLD', 5),
        'cooldown' => (int) env('CDN_HEALTH_COOLDOWN', 300),
        'window' => (int) env('CDN_HEALTH_WINDOW', 60),
    ],

    /*
    |--------------------------------------------------------------------------
    | Driver-specific settings
    |--------------------------------------------------------------------------
    */
    'drivers' => [
        'bunny' => [
            'access_key' => env('BUNNY_ACCESS_KEY', ''),
            'storage_zone' => env('BUNNY_STORAGE_ZONE', ''),
            'purge_endpoint' => 'https://api.bunny.net/purge',
        ],
        'cloudflare' => [
            'account_id' => env('CLOUDFLARE_ACCOUNT_ID', ''),
            'api_token' => env('CLOUDFLARE_API_TOKEN', ''),
        ],
    ],

];
