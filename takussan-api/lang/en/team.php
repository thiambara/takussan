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
];
