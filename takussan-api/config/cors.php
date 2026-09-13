<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Cross-domain front ↔ API (two origins, both on the VPS since ADR-0028;
    | www.takussan.com stays on Vercel until phase F of its plan) requires:
    |  - `supports_credentials = true` so Sanctum session cookies traverse
    |  - the front origin allowed explicitly (FRONTEND_URL)
    |  - Vercel preview deploy URLs allowed via regex
    |
    | See docs/infra/hebergement.md for the full deployment context.
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'login', 'logout', 'storage/*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [env('FRONTEND_URL', 'http://localhost:3000')],

    'allowed_origins_patterns' => [
        '#^https://takussan-[a-z0-9-]+\.vercel\.app$#',
    ],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
