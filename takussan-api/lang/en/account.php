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

            // TCK-272 — voie de step-up alternative (code e-mail).
            'password_not_applicable' => 'This account has no password: confirm with the code sent to your e-mail.',
            'step_up_not_applicable' => 'This account has a password: confirm with your password.',
            'step_up_code_required' => 'Confirmation code required.',
            'step_up_code_invalid' => 'Confirmation code is invalid or has expired.',
        ],
        // TCK-272 — le message est volontairement invariant : il ne dit
        // jamais si un code a effectivement été émis.
        'step_up' => [
            'code_sent' => 'If this account can receive a code, one has just been sent to your e-mail address.',
        ],

        'obligations' => [
            'lease_active' => 'Active lease :reference must be ended.',
            'payment_pending' => 'Pending payment :reference.',
            'invoice_pending' => 'Pending invoice :reference.',
            'booking_open' => 'Open booking :reference.',
        ],
    ],

];
