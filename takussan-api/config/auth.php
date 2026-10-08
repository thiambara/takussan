<?php

use App\Models\User;

return [

    /*
    |--------------------------------------------------------------------------
    | Authentication Defaults
    |--------------------------------------------------------------------------
    |
    | This option defines the default authentication "guard" and password
    | reset "broker" for your application. You may change these values
    | as required, but they're a perfect start for most applications.
    |
    */

    'defaults' => [
        'guard' => env('AUTH_GUARD', 'web'),
        'passwords' => env('AUTH_PASSWORD_BROKER', 'users'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Authentication Guards
    |--------------------------------------------------------------------------
    |
    | Next, you may define every authentication guard for your application.
    | Of course, a great default configuration has been defined for you
    | which utilizes session storage plus the Eloquent user provider.
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | Supported: "session"
    |
    */

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | User Providers
    |--------------------------------------------------------------------------
    |
    | All authentication guards have a user provider, which defines how the
    | users are actually retrieved out of your database or other storage
    | system used by the application. Typically, Eloquent is utilized.
    |
    | If you have multiple user tables or models you may configure multiple
    | providers to represent the model / table. These providers may then
    | be assigned to any extra authentication guards you have defined.
    |
    | Supported: "database", "eloquent"
    |
    */

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', User::class),
        ],

        // 'users' => [
        //     'driver' => 'database',
        //     'table' => 'users',
        // ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Resetting Passwords
    |--------------------------------------------------------------------------
    |
    | These configuration options specify the behavior of Laravel's password
    | reset functionality, including the table utilized for token storage
    | and the user provider that is invoked to actually retrieve users.
    |
    | The expiry time is the number of minutes that each reset token will be
    | considered valid. This security feature keeps tokens short-lived so
    | they have less time to be guessed. You may change this as needed.
    |
    | The throttle setting is the number of seconds a user must wait before
    | generating more password reset tokens. This prevents the user from
    | quickly generating a very large amount of password reset tokens.
    |
    */

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => env('AUTH_PASSWORD_RESET_TOKEN_TABLE', 'password_reset_tokens'),
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Password Confirmation Timeout
    |--------------------------------------------------------------------------
    |
    | Here you may define the number of seconds before a password confirmation
    | window expires and users are asked to re-enter their password via the
    | confirmation screen. By default, the timeout lasts for three hours.
    |
    */

    'password_timeout' => env('AUTH_PASSWORD_TIMEOUT', 10800),

    /*
    |--------------------------------------------------------------------------
    | Account Deletion (TCK-080)
    |--------------------------------------------------------------------------
    |
    | RGPD self-service deletion: window between the user's request and the
    | irreversible anonymization. Set in `.env` (`ACCOUNT_DELETION_GRACE_DAYS`)
    | — never exposed to agencies/users. The reminder window controls when
    | the J-N reminder email goes out (default J-7).
    */

    'account_deletion' => [
        'grace_days' => (int) env('ACCOUNT_DELETION_GRACE_DAYS', 30),
        'reminder_days_before' => (int) env('ACCOUNT_DELETION_REMINDER_DAYS', 7),
    ],

    /*
    |--------------------------------------------------------------------------
    | Connexion par téléphone (TCK-589, ADR-0033)
    |--------------------------------------------------------------------------
    |
    | Faux par défaut. Allumé environnement par environnement, par une
    | personne, APRÈS un envoi réel mesuré (onglet Dokploy, ADR-0028). Éteint,
    | `auth/phone/request-code` et `verify-code` rendent 404 et les invitations
    | exigent l'e-mail.
    */

    'phone_login' => [
        'enabled' => (bool) env('PHONE_LOGIN_ENABLED', false),
    ],

    /*
    |--------------------------------------------------------------------------
    | Sessions bornées (TCK-589)
    |--------------------------------------------------------------------------
    |
    | Durée absolue et expiration par inactivité de tout jeton ; la session
    | super-admin est plus courte : `platform.session_max_minutes` (lu à
    | l'émission du jeton) absolus et 30 min d'inactivité. La confirmation 2FA
    | récente (step-up) vaut 10 min, sur le jeton qui l'a faite.
    | La durée absolue de tout jeton (hérités compris, par `created_at`) est
    | aussi `sanctum.expiration`.
    */

    'sessions' => [
        'absolute_minutes' => 43200,          // 30 jours
        'idle_minutes' => 10080,              // 7 jours
        'super_admin_idle_minutes' => 30,
        'step_up_minutes' => 10,
    ],

];
