<?php

return [
    'cooptation' => [
        'errors' => [
            'not_super_admin' => 'Only a super-admin can coopt another super-admin.',
            'already_super_admin' => 'The user :email is already a super-admin.',
            'enroll_first' => 'You must call /super-admin/2fa/enroll before confirming a code.',
            'invalid_code' => 'Invalid TOTP code.',
            'not_pending' => 'No pending super-admin onboarding for this account.',
            'invitation_not_found' => 'This cooptation invitation could not be found.',
        ],
        'notifications' => [
            'invited' => [
                'subject' => 'A new super-admin has been invited (:email)',
                'body' => ':inviter just invited :email to become a super-admin.',
            ],
            'accepted' => [
                'subject' => ':name is now a super-admin',
                'body' => ':name (:email) has completed 2FA enrollment and is now a super-admin.',
            ],
        ],
    ],
];
