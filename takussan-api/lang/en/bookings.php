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
];
