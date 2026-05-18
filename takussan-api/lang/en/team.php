<?php

return [
    'errors' => [
        'forbidden' => 'You do not have access to team management for this agency.',
    ],
    'invite' => [
        'errors' => [
            'individual_agency' => "Individual agencies don't have a team to manage.",
            'permission_denied' => "You do not have permission to manage this agency's team.",
            'already_member' => 'This email is already linked to an agent in this agency (#:profile_id).',
            'invalid_role' => 'The requested role is not allowed for this invitation.',
        ],
    ],
    // TCK-259 — agent post-acceptance onboarding wizard
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'The verification code is invalid or has expired.',
            'not_owner' => "You don't have access to this agent profile.",
        ],
    ],
];
