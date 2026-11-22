<?php

/*
 * TCK-2866 — la balance âgée imprimée (`pdf.reports.aged-balance`), à envoyer au bailleur.
 */
return [
    'title' => 'Aged balance of unpaid rent',
    'agency' => 'Agency',
    'landlord' => 'Landlord',
    'all_landlords' => 'All landlords',
    'as_of' => 'As of',
    'tenant' => 'Tenant',
    'total' => 'Total',
    'count' => 'Instalments',
    'deposits_held' => 'Deposits held',
    'none' => 'No overdue instalment at this date.',
    'unnamed' => 'Unnamed',
    'buckets' => [
        '1_30' => '1 to 30 days',
        '31_60' => '31 to 60 days',
        '61_90' => '61 to 90 days',
        '90_plus' => 'Over 90 days',
    ],
];
