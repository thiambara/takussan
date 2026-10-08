<?php

/*
 * TCK-594 (ADR-0039) — les sorties d'argent : reversements, quatre yeux, destinations, factures.
 * Bloc propre, en ajout seulement : aucune autre branche n'écrit ce fichier.
 */
return [
    // Les messages de validation (422 `errors`) : les refus passent par `abort_code` (errors.php).
    'payout' => [
        'no_items' => 'Citez au moins un encaissement ou une facture d\'intervention.',
        'foreign_item' => 'La pièce n° :id ne relève pas de cette agence ou de ce bailleur.',
        'ineligible_item' => 'La pièce n° :id n\'est pas un encaissement reversable.',
        'foreign_destination' => 'Cette destination de paiement n\'appartient pas au bénéficiaire.',
    ],

    'statement' => [
        'title' => 'Relevé de gérance',
        'annual_title' => 'Attestation annuelle de gérance',
        'period' => 'Période',
        'landlord' => 'Bailleur',
        'property' => 'Bien',
        'collected' => 'Loyers encaissés',
        'commission' => 'Commission',
        'fees' => 'Frais d\'intervention',
        'net' => 'Net',
        'paid_out' => 'Reversé',
        'unpaid' => 'Impayés de la période',
        'payouts' => 'Reversements',
        'reference' => 'Référence',
        'date' => 'Date',
        'total' => 'Total',
        'agency' => 'Agence',
    ],

    'legal' => [
        'ninea' => 'NINEA',
        'rccm' => 'RCCM',
    ],
];
