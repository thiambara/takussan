<?php

/**
 * TCK-080 — RGPD account deletion strings (EN).
 */
return [

    'deletion' => [
        'errors' => [
            'invalid_request' => 'Invalid deletion request.',
            'password_invalid' => 'Incorrect password.',
            'two_factor_required' => 'Two-factor code required or invalid.',
            'has_obligations' => 'You have outstanding obligations preventing deletion.',
            'no_pending_request' => 'No pending deletion request.',
            'already_executed' => 'Deletion has already been executed.',
            'grace_expired' => 'The cancellation window has expired.',
        ],
        'obligations' => [
            'lease_active' => 'Active lease :reference must be ended.',
            'payment_pending' => 'Pending payment :reference.',
            'invoice_pending' => 'Pending invoice :reference.',
            'booking_open' => 'Open booking :reference.',
        ],
    ],

];
