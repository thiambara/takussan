<?php

return [
    'invite' => [
        'errors' => [
            'individual_agency' => 'Individual agencies cannot invite owners.',
            'permission_denied' => 'You do not have permission to invite an owner in this agency.',
            'already_member' => 'This email is already linked to an owner in this agency (#:profile_id).',
            'company_name_required' => 'Company name is required for company-type owners.',
        ],
    ],
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'The verification code is invalid or expired.',
            'not_owner' => 'You do not have access to this owner profile.',
        ],
    ],
    // TCK-2909 — les termes du mandat (`PATCH /api/owners/{id}`).
    'mandate' => [
        'nothing_to_update' => 'Provide at least one mandate setting to update.',
        'ends_before_start' => 'The mandate cannot end before it starts.',
        'referent_not_staff' => "The referent must be active staff of the landlord's agency.",
    ],
];
