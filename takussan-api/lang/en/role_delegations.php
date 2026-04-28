<?php

return [
    'notifications' => [
        'activated' => [
            'title' => 'Role delegated — :role',
            'body_beneficiary' => 'You have been granted the :role role until :ends_at.',
            'body_delegator' => 'The delegation to :beneficiary for the :role role is now active.',
        ],
        'expired' => [
            'title' => 'Delegation expired — :role',
            'body_beneficiary' => 'Your delegation for the :role role has ended.',
            'body_delegator' => 'The delegation to :beneficiary for the :role role has expired.',
        ],
        'revoked' => [
            'title' => 'Delegation revoked — :role',
            'body_beneficiary' => 'Your delegation for the :role role has been revoked.',
            'body_delegator' => 'You have revoked the delegation from :beneficiary for the :role role.',
        ],
    ],
    'validation' => [
        'self_delegation' => 'You cannot delegate a role to yourself.',
        'non_delegable_role' => 'This role cannot be delegated.',
        'max_duration' => 'The maximum duration is :max days.',
        'user_not_in_agency' => 'The user does not belong to this agency.',
        'already_primary_admin' => 'This user is already the primary administrator of the agency.',
    ],
];
