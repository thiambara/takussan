<?php

return [
    'roles' => [
        'owner' => 'owner',
        'agent' => 'agent',
        'agency_admin' => 'agency administrator',
        'service_provider' => 'service provider',
        'super_admin' => 'super administrator',
    ],
    'errors' => [
        'duplicate_pending' => 'An invitation is already pending for this email (#:id).',
        'requires_login' => 'This email maps to an existing account. Please log in to accept the invitation.',
        'email_mismatch' => 'The logged-in account email does not match this invitation.',
        'token_not_found' => 'This invitation cannot be found.',
        'token_expired' => 'This invitation has expired.',
        'token_accepted' => 'This invitation has already been accepted.',
        'token_revoked' => 'This invitation has been revoked.',
        'token_sent' => 'This invitation is still pending acceptance.',
        'cannot_create' => 'You do not have permission to send invitations.',
        'cannot_view' => 'You do not have permission to view this invitation.',
        'cannot_revoke' => 'You do not have permission to revoke this invitation.',
        'cannot_resend' => 'This invitation can no longer be resent.',
        'already_accepted' => 'This invitation has already been accepted and cannot be revoked.',
        'invalid_role' => 'The requested role is not allowed for invitations.',
        'cross_agency' => 'You cannot invite someone into a different agency.',
    ],
];
