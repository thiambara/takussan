<?php

// TCK-530 — messages of App\Services\Booking\BookingQuote.
return [
    'rent_period_not_bookable' => 'This property is rented by the month or year: it requires a lease, not a short-stay booking.',
    'dates_required' => 'Provide check-in and check-out dates covering at least one night.',
    'amount_mismatch' => 'This amount does not match the property price for these dates.',
    'currency_mismatch' => 'This currency is not the property\'s: its prices are expressed in its own currency.',
    'stay_too_long' => 'This stay is too long to be booked: bring the check-out date closer.',
    'start_in_past' => 'The check-in date cannot be in the past.',
    'end_before_start' => 'The check-out date must come after the check-in date.',
    // TCK-596 — title of the task opened by BookingRefundTaskService.
    'refund_task' => [
        'title' => 'Refund to process — booking :reference',
    ],
    // TCK-2872 (ADR-0110 § 2) — the documents of the file, for a notification text.
    'dossier_pieces' => [
        'identity' => 'identity document',
        'payslips' => 'salary slips',
        'employment_certificate' => 'employment certificate',
        'guarantor_commitment' => 'guarantor commitment',
        'guarantor_identity' => 'guarantor identity document',
        'proof_of_funds' => 'proof of funds',
        'other' => 'other document',
    ],
    // TCK-2873 (ADR-0110 § 5) — the customer's answer to a counter-offer, rendered in a notification to the agency.
    'counter_offer_answers' => [
        'accepted' => 'has accepted',
        'declined' => 'has declined',
    ],
];
