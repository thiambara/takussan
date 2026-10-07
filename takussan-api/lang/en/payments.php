<?php

// TCK-593 — tenant collections: initiation guard, late fee settled at the agency, rent receipt.
return [
    'payment_not_payable' => 'This payment can no longer be paid online: it is already settled, refunded or has nothing due.',
    'late_fee_not_due' => 'No late fee remains due on this instalment.',
    'receipt_unpaid' => 'A rent receipt is only issued for a paid rent.',
    'checkout_in_progress' => 'An online payment is in progress on this instalment: try again in a few minutes.',
    'duplicate_payment' => [
        'title' => 'Payment collected twice',
        'body' => 'An online payment of :amount was received for :reference, which was already settled. Refund the payer or allocate the amount.',
        'late_fee_body' => 'The late fee of :amount for :reference, already settled at the agency, was also collected online. Refund the payer or allocate the amount.',
    ],
];
