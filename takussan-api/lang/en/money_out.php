<?php

/*
 * TCK-594 (ADR-0039) — money going out: payouts, four eyes, destinations, invoices.
 */
return [
    'segregation' => [
        'prepare' => 'The payee of a payout cannot prepare it.',
        'approve' => 'You prepared this payout, or you are its payee: another member must approve it.',
        'pay' => 'You approved this payout, or you are its payee: another member must mark it paid.',
    ],

    'payout' => [
        'landlord_not_member' => 'This landlord does not belong to your agency.',
        'agency_required' => 'A payout is issued on behalf of an agency.',
        'no_items' => 'Cite at least one collected payment or maintenance bill.',
        'foreign_item' => 'Item #:id does not belong to this agency or this landlord.',
        'ineligible_item' => 'Item #:id is not a collected payment that can be paid out.',
        'foreign_destination' => 'This payment destination does not belong to the payee.',
        'already_paid_out' => 'One of the cited items has already been paid out.',
        'mixed_currencies' => 'A payout cannot mix two currencies.',
        'negative_net' => 'The net amount of a payout cannot be negative.',
        'not_awaiting_approval' => 'This payout is not awaiting approval.',
        'awaiting_approval' => 'This payout is awaiting approval.',
        'amount_changed_since_approval' => 'The amount changed since it was approved: have it approved again.',
        'payment_method_required' => 'Specify the payment method.',
        'reference_required' => 'The transaction reference is required unless paid in cash.',
        'unverified_destination' => 'This payout can only go to a verified destination of the payee, of the chosen method.',
        'cannot_process' => 'This payout cannot be marked paid in its current state.',
        'cannot_fail' => 'This payout cannot be marked failed in its current state.',
        'cannot_cancel' => 'This payout cannot be cancelled in its current state.',
        'failed_reason_required' => 'A failure reason is required.',
    ],

    'threshold' => [
        'needs_two_approvers' => 'The approval threshold requires at least two active members allowed to approve.',
    ],

    'platform' => [
        'agency_frozen' => 'This agency is not active: its payouts are frozen.',
        'agency_unverified' => 'An unverified agency cannot be paid.',
        'already_closed' => 'This period is already closed for this agency.',
        'invalid_transition' => 'This payout cannot move from :from to :to.',
    ],

    'invoice' => [
        'foreign_target' => 'This lease or booking does not belong to the invoice\'s agency.',
        'credit_note_final' => 'A credit note cannot be cancelled.',
        'credit_note_label' => 'Credit note',
        'credits_label' => 'Cancels invoice :reference',
    ],

    'bill' => [
        'not_payable' => 'Only a validated maintenance bill can be paid.',
        'already_in_payout' => 'This maintenance bill is already in an ongoing payout.',
        'not_pending' => 'This maintenance bill is no longer awaiting validation.',
    ],

    'payout_method' => [
        'already_verified' => 'This destination is already verified.',
    ],

    'statement' => [
        'title' => 'Management statement',
        'annual_title' => 'Annual management certificate',
        'period' => 'Period',
        'landlord' => 'Landlord',
        'property' => 'Property',
        'collected' => 'Rent collected',
        'commission' => 'Commission',
        'fees' => 'Maintenance fees',
        'net' => 'Net',
        'paid_out' => 'Paid out',
        'unpaid' => 'Unpaid for the period',
        'payouts' => 'Payouts',
        'reference' => 'Reference',
        'date' => 'Date',
        'total' => 'Total',
        'agency' => 'Agency',
    ],

    'legal' => [
        'ninea' => 'NINEA',
        'rccm' => 'RCCM',
    ],

    'notifications' => [
        'greeting' => 'Hello,',
        'salutation' => 'The Takussan team',
        'payout_awaiting_approval' => [
            'subject' => 'Payout :reference to approve',
            'intro' => 'Payout :reference of :net_amount :currency is awaiting your approval.',
        ],
        'payout_processed' => [
            'subject' => 'Payout :reference sent',
            'intro' => 'A payout of :net_amount :currency has been sent to you.',
            'reference_line' => 'Transaction reference: :transaction_id',
            'destination_line' => 'Destination: :destination',
        ],
        'payout_failed' => [
            'subject' => 'Payout :reference failed',
            'intro' => 'Payout :reference of :net_amount :currency did not go through.',
            'reason_line' => 'Reason: :reason',
        ],
        'payout_due' => [
            'subject' => 'Payout :reference is due',
            'intro' => 'Payout :reference of :net_amount :currency is due: send it, then enter its reference.',
        ],
        'payout_method_changed' => [
            'subject' => 'Your payment destination changed',
            'intro' => 'Payment destination :destination was :action on your account.',
            'warning' => 'If you did not make this change, contact your agency immediately.',
            'actions' => [
                'added' => 'added',
                'updated' => 'updated',
                'removed' => 'removed',
            ],
        ],
        'owner_statement_available' => [
            'subject' => 'Your :period management statement is available',
            'intro' => 'Your management statement for :period is available in your space.',
        ],
    ],
];
