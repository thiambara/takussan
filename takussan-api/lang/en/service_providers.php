<?php

return [
    'invite' => [
        'errors' => [
            'agency_kind' => 'This agency cannot invite service providers.',
            'permission_denied' => 'You do not have permission to invite a service provider for this agency.',
            'already_member' => 'This email is already an active service provider of this agency (#:profile_id).',
        ],
    ],
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'The verification code is invalid or expired.',
            'not_owner' => 'You cannot edit this service provider profile.',
        ],
    ],
];
