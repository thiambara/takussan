<?php

/*
 * TCK-594 (ADR-0039) — xaalis buy génn : reversements, ñeenti bët, destinations, factures.
 */
return [
    // Les messages de validation (422 `errors`) : les refus passent par `abort_code` (errors.php).
    'payout' => [
        'no_items' => 'Tudd benn encaissement walla benn facture d\'intervention.',
        'foreign_item' => 'Pièce n° :id bokkul ci bii agence walla bii bailleur.',
        'ineligible_item' => 'Pièce n° :id du encaissement bu ñu mën a delloo.',
        'foreign_destination' => 'Bii destination de paiement du yu ki ñuy fey.',
    ],

    'statement' => [
        'title' => 'Relevé de gérance',
        'annual_title' => 'Attestation annuelle de gérance',
        'period' => 'Période',
        'landlord' => 'Bailleur',
        'property' => 'Kër',
        'collected' => 'Loyer yi ñu jot',
        'commission' => 'Commission',
        'fees' => 'Frais d\'intervention',
        'net' => 'Net',
        'paid_out' => 'Li ñu delloo',
        'unpaid' => 'Li ñu feyul ci période bi',
        'unpaid_as_of' => 'au :date',
        'late_fees_outstanding' => 'Pénalités de retard à recouvrer',
        'payouts' => 'Reversements',
        // P177.03 (TCK-2041) — le versé du relevé se lit au mois (ou à l'année) de son versement.
        'paid_this_month' => 'Versé ce mois',
        'paid_this_year' => 'Versé cette année',
        'reference' => 'Référence',
        'date' => 'Bés',
        'total' => 'Total',
        'agency' => 'Agence',
    ],

    'legal' => [
        'ninea' => 'NINEA',
        'rccm' => 'RCCM',
    ],
];
