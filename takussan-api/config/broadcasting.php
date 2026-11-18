<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Broadcaster
    |--------------------------------------------------------------------------
    |
    | Default connection used to broadcast events/notifications. Defaults to
    | `null` so the stack is safe in CI/tests when no realtime provider is
    | configured. Set BROADCAST_CONNECTION=reverb|pusher|log in .env for real
    | environments.
    |
    | Supported: "reverb", "pusher", "ably", "redis", "log", "null"
    */

    'default' => env('BROADCAST_CONNECTION', 'null'),

    /*
    |--------------------------------------------------------------------------
    | Broadcast Connections
    |--------------------------------------------------------------------------
    */

    'connections' => [

        'reverb' => [
            'driver' => 'reverb',
            'key' => env('REVERB_APP_KEY'),
            'secret' => env('REVERB_APP_SECRET'),
            'app_id' => env('REVERB_APP_ID'),
            'options' => [
                'host' => env('REVERB_HOST'),
                'port' => env('REVERB_PORT', 443),
                'scheme' => env('REVERB_SCHEME', 'https'),
                'useTLS' => env('REVERB_SCHEME', 'https') === 'https',
                // TCK-2952 — le client Pusher passe SON délai à chaque requête (`Pusher::post()`,
                // `'timeout' => $this->settings['timeout']`, 30 s par défaut), et il l'emporte sur celui du
                // client HTTP ci-dessous : sans cette ligne, un Reverb qui accepte la connexion et ne répond
                // pas coûterait 30 s à la requête.
                'timeout' => 1,
            ],
            // TCK-2952 (ADR-0129 § 3) — l'émission est synchrone, dans la requête : 1 s au plus pour joindre
            // Reverb et pour qu'il réponde (défauts du framework : 10 s et 30 s). Un échec est avalé et
            // compté par `App\Support\TempsReel\TempsReel`, qui n'essaie plus jusqu'à la fin de la requête.
            'client_options' => [
                'connect_timeout' => 1,
                'timeout' => 1,
            ],
        ],

        'pusher' => [
            'driver' => 'pusher',
            'key' => env('PUSHER_APP_KEY'),
            'secret' => env('PUSHER_APP_SECRET'),
            'app_id' => env('PUSHER_APP_ID'),
            'options' => [
                'cluster' => env('PUSHER_APP_CLUSTER'),
                'host' => env('PUSHER_HOST') ?: 'api-'.env('PUSHER_APP_CLUSTER', 'mt1').'.pusher.com',
                'port' => env('PUSHER_PORT', 443),
                'scheme' => env('PUSHER_SCHEME', 'https'),
                'encrypted' => true,
                'useTLS' => env('PUSHER_SCHEME', 'https') === 'https',
            ],
        ],

        'ably' => [
            'driver' => 'ably',
            'key' => env('ABLY_KEY'),
        ],

        'log' => [
            'driver' => 'log',
        ],

        'null' => [
            'driver' => 'null',
        ],

    ],

];
