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

    'mailgun' => [
        'domain' => env('MAILGUN_DOMAIN'),
        'secret' => env('MAILGUN_SECRET'),
        'endpoint' => env('MAILGUN_ENDPOINT', 'api.mailgun.net'),
        'scheme' => 'https',
    ],

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'africa_mobile' => [
        'api_url' => env('AFRICA_MOBILE_API_URL'),
        'account_id' => env('AFRICA_MOBILE_ACCOUNT_ID'),
        'password' => env('AFRICA_MOBILE_PASSWORD'),
        'sender' => env('AFRICA_MOBILE_SENDER'),
        'api_key' => env('AFRICA_MOBILE_API_KEY')
    ],

    'aws' => [
        'bucket' => env('AWS_BUCKET', 'http://127.0.0.1:8001/api'),
        'access_key_id' => env('AWS_ACCESS_KEY_ID', ''),
        'secret_access_key' => env('AWS_SECRET_ACCESS_KEY', ''),
        'default_region' => env('AWS_DEFAULT_REGION', '')
    ],

    'email' => [
        'sendgrid_api_key' => env('SENDGRID_API_KEY'),
        'sendgrid_from_email' => env('SENDER_FORM_EMAIL')
    ],

    'twilio' => [
        'auth_sid' => env('TWILIO_AUTH_SID'),
        'auth_token' => env('TWILIO_AUTH_TOKEN'),
        'whatsapp_from' => env('TWILIO_WHATSAPP_FROM')
    ],

    'wave' => [
        'checkout_session_url'=>env('WAVE_CHECKOUT_SESSION_URL'),
        'oauth_token'=>env('WAVE_OAUTH_TOKEN'),
        'error_url'=>env('WAVE_ERROR_URL'),
        'success_url'=>env('WAVE_SUCCESS_URL'),
        'webhook_secret'=>env('WAVE_WEBHOOK_SECRET', 'WH_2_7sFHspkC13'),
    ],

    'whatsapp' => [
        'base_url'=> env('WHATSAPP_BASE_URL'),
        'api_version'=> env('WHATSAPP_API_VERSION'),
        'auth_token'=> env('WHATSAPP_AUTH_TOKEN'),
        'from'=> env('WHATSAPP_WHATSAPP_FROM'),
    ],

    'shared' => [
        'public_routes_secret_key' => env('PUBLIC_ROUTES_SECRET_KEY', 'chhcvyrudZRFdue24958T948jdjhdDFRRTYUFHYHEFHe134cujjdhDjuzscfhnzzucjd')
    ],

    /*
    |--------------------------------------------------------------------------
    | SOCIALITE SERVICES
    |--------------------------------------------------------------------------
     */

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_OAUTH2_WEB_CALLBACK_URL')
    ]

];
