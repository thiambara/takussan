<?php

return [
    'submit' => [
        'errors' => [
            'not_individual' => 'This agency is already professional — no upgrade request needed.',
            'permission_denied' => 'You do not have permission to submit an upgrade request for this agency.',
            'pending_exists' => 'A pending request already exists for this agency (#:request_id). Revoke it before submitting a new one.',
        ],
    ],
    'revoke' => [
        'errors' => [
            'not_pending' => 'Only pending requests can be revoked.',
            'permission_denied' => 'You do not have permission to revoke this request.',
        ],
    ],
    'review' => [
        'errors' => [
            'not_pending' => 'This request has already been reviewed — no new decision can be recorded.',
            'permission_denied' => 'You do not have permission to review this request.',
            'comment_required' => 'A rejection reason is required (5 characters minimum).',
        ],
    ],
    'notifications' => [
        'submitted' => [
            'subject' => 'New agency upgrade request: :agency',
            'body' => ':submitter (#:agency) submitted a request to upgrade their agency to professional.',
            'action' => 'Review the request',
        ],
        'approved' => [
            'subject' => 'Your upgrade request has been approved',
            'body' => 'Your upgrade request has been approved. Your agency is now in professional mode.',
            'action' => 'Open my dashboard',
        ],
        'rejected' => [
            'subject' => 'Your upgrade request has been rejected',
            'body' => 'Your upgrade request has been rejected. Reason: :comment',
            'action' => 'Submit a new request',
        ],
    ],
];
