<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => env('FACEBOOK_REDIRECT_URI'),
    ],

    /*
    | TCK-598 (ADR-0052 §2) — l'invalidation du cache de données de la fiche publique, côté front.
    | Les deux vides : `RevalidatePublicPropertyPage` ne fait rien, et seule la revalidation
    | temporelle du front (300 s) s'applique. Le secret est le MÊME que la clé homonyme du front.
    */
    'public_cache' => [
        'revalidate_url' => env('PUBLIC_CACHE_REVALIDATE_URL', ''),
        'revalidate_secret' => env('PUBLIC_CACHE_REVALIDATE_SECRET', ''),
    ],

    'apple' => [
        'client_id' => env('APPLE_CLIENT_ID'),
        // Generated dynamically at runtime by AppleClientSecretGenerator from
        // the .p8 private key. Left null so that the service never reads a
        // stale value from env.
        'client_secret' => null,
        'team_id' => env('APPLE_TEAM_ID'),
        'key_id' => env('APPLE_KEY_ID'),
        'private_key_path' => env('APPLE_PRIVATE_KEY_PATH'),
        'redirect' => env('APPLE_REDIRECT_URI'),
    ],

];
