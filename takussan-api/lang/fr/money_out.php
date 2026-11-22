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
        'unpaid_as_of' => 'au :date',
        'late_fees_outstanding' => 'Pénalités de retard à recouvrer',
        'payouts' => 'Reversements',
        // P177.03 (TCK-2041) — le versé du relevé se lit au mois (ou à l'année) de son versement.
        'paid_this_month' => 'Versé ce mois',
        'paid_this_year' => 'Versé cette année',
        'reference' => 'Référence',
        'date' => 'Date',
        'total' => 'Total',
        'agency' => 'Agence',
        // TCK-2321 (P177.05) — le relevé envoyé, et ce qui a été écrit depuis.
        'sent_on' => 'Relevé envoyé le :date',
        'rectification' => 'Rectificatif au :date',
        'rectification_intro' => 'Écritures enregistrées depuis l\'envoi de ce relevé. Les montants ci-dessus sont ceux du relevé envoyé.',
        'rectification_delta' => 'Écart',
        'rectification_added' => 'Ajoutée',
        'rectification_removed' => 'Retirée',
        'rectification_line' => 'Ligne',
        'gross' => 'Encaissé',
        'clawback' => 'Reprise',
    ],

    'legal' => [
        'ninea' => 'NINEA',
        'rccm' => 'RCCM',
    ],

    // TCK-2909 — l'avis de versement (`GET /api/payouts/{payout}/notice/pdf`).
    'notice' => [
        'title' => 'Avis de versement',
        'nature' => 'Nature',
        'paid_on' => 'Versé le',
        'method' => 'Moyen',
        'transaction' => 'Référence de l\'opération',
        'net' => 'Montant versé',
        'attestation' => 'Cet avis atteste du versement au bailleur du montant indiqué, net de la commission de gestion.',
        'natures' => [
            'advance' => 'Acompte',
            'balance' => 'Solde',
            'deposit_refund' => 'Restitution de caution',
            'refund' => 'Remboursement',
            'provider_bill' => 'Facture de prestataire',
        ],
        'methods' => [
            'cash' => 'Espèces',
            'bank_transfer' => 'Virement bancaire',
            'mobile_money' => 'Mobile money',
            'wave' => 'Wave',
            'orange_money' => 'Orange Money',
            'free_money' => 'Free Money',
            'check' => 'Chèque',
            'card' => 'Carte bancaire',
        ],
    ],
];
