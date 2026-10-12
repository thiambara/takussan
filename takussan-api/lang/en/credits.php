<?php

// TCK-633 lot F (ADR-0061) — credit ledger and listing promotion notifications.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Credits added to your workspace',
            'body' => 'Credits added to :agency: :credits. They are valid until :date.',
            'body_no_expiry' => 'Credits added to :agency: :credits.',
        ],
        'expiring' => [
            'title' => 'Some credits expire soon',
            'body' => 'Credits of :agency expiring on :date: :credits. Use them to promote your listings.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Promotion ended',
            'body' => 'The promotion of “:property” has ended.',
        ],
        'refunded' => [
            'title' => 'Promotion refunded',
            'body' => 'The promotion of “:property” has stopped. Credits refunded: :credits.',
            'body_with_expired' => 'The promotion of “:property” has stopped. Credits refunded: :credits. Credits not refunded because they had already expired: :expired.',
        ],
    ],
];
