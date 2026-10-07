<?php

// TCK-593 — encaissements du locataire : garde d'initiation, pénalité réglée à l'agence, quittance.
return [
    'payment_not_payable' => 'Ce paiement n\'est plus payable en ligne : il est déjà réglé, remboursé ou sans montant dû.',
    'late_fee_not_due' => 'Aucune pénalité de retard ne reste due sur cette échéance.',
    'receipt_unpaid' => 'La quittance n\'est délivrée que pour un loyer acquitté.',
    'checkout_in_progress' => 'Un paiement en ligne est en cours sur cette échéance : réessayez dans quelques minutes.',
    'duplicate_payment' => [
        'title' => 'Paiement encaissé deux fois',
        'body' => 'Un paiement en ligne de :amount a été reçu pour :reference, déjà réglée. Remboursez le payeur ou affectez la somme.',
        'late_fee_body' => 'La pénalité de retard de :amount pour :reference, déjà réglée à l\'agence, a aussi été encaissée en ligne. Remboursez le payeur ou affectez la somme.',
    ],
];
