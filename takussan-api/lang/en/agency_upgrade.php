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
    'notifications' => [
        'submitted' => [
            'subject' => 'New agency upgrade request: :agency',
            'body' => ':submitter (#:agency) submitted a request to upgrade their agency to professional.',
            'action' => 'Review the request',
        ],
    ],
];
