<?php

/*
 * TCK-594 (ADR-0039) — money going out: payouts, four eyes, destinations, invoices.
 */
return [
    // Les messages de validation (422 `errors`) : les refus passent par `abort_code` (errors.php).
    'payout' => [
        'no_items' => 'Cite at least one collected payment or maintenance bill.',
        'foreign_item' => 'Item #:id does not belong to this agency or this landlord.',
        'ineligible_item' => 'Item #:id is not a collected payment that can be paid out.',
        'foreign_destination' => 'This payment destination does not belong to the payee.',
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
];
