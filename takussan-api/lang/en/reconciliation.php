<?php

return [
    'notifications' => [
        'imported' => [
            'title' => 'Statement imported',
            'body' => 'Your statement :bank (:lines_count lines) is ready for reconciliation.',
        ],
        'finalized' => [
            'title' => 'Statement finalized',
            'body' => 'Statement :period has been finalized (:confirmed/:total lines reconciled).',
        ],
    ],

    'validation' => [
        'duplicate_file' => 'This statement has already been imported for this agency.',
        'currency_mismatch' => 'Line currency (:line) does not match payment currency (:payment).',
        'cross_agency' => 'The target payment does not belong to this agency.',
        'already_reconciled' => 'This payment is already reconciled to another line.',
        'statement_closed' => 'This statement is finalized, no modification allowed.',
        'direction_mismatch' => 'A credit is reconciled with a collection, a debit with a payout.',
        'csv_column' => 'A column is designated by its header name or by its position.',
        'payout_not_completed' => 'Only a completed payout can be reconciled with a debit.',
    ],

    'status' => [
        'processing' => 'Processing',
        'ready_for_review' => 'Ready for review',
        'partially_reconciled' => 'Partially reconciled',
        'reconciled' => 'Reconciled',
        'archived' => 'Archived',
        'failed' => 'Analysis failed',
    ],

    'line_status' => [
        'unmatched' => 'Unmatched',
        'suggested' => 'Suggested',
        'confirmed' => 'Reconciled',
        'ignored' => 'Ignored',
    ],
];
