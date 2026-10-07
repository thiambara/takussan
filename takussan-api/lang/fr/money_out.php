<?php

/*
 * TCK-594 (ADR-0039) — les sorties d'argent : reversements, quatre yeux, destinations, factures.
 * Bloc propre, en ajout seulement : aucune autre branche n'écrit ce fichier.
 */
return [
    'segregation' => [
        'prepare' => 'Le bénéficiaire d\'un reversement ne peut pas le préparer.',
        'approve' => 'Vous avez préparé ce reversement, ou en êtes le bénéficiaire : un autre membre doit l\'approuver.',
        'pay' => 'Vous avez approuvé ce reversement, ou en êtes le bénéficiaire : un autre membre doit le marquer payé.',
    ],

    'payout' => [
        'landlord_not_member' => 'Ce bailleur n\'appartient pas à votre agence.',
        'agency_required' => 'Un reversement s\'émet au nom d\'une agence.',
        'no_items' => 'Citez au moins un encaissement ou une facture d\'intervention.',
        'foreign_item' => 'La pièce n° :id ne relève pas de cette agence ou de ce bailleur.',
        'ineligible_item' => 'La pièce n° :id n\'est pas un encaissement reversable.',
        'foreign_destination' => 'Cette destination de paiement n\'appartient pas au bénéficiaire.',
        'already_paid_out' => 'Une des pièces citées est déjà reversée.',
        'mixed_currencies' => 'Un reversement ne mélange pas deux devises.',
        'negative_net' => 'Le net d\'un reversement ne peut pas être négatif.',
        'not_awaiting_approval' => 'Ce reversement n\'attend pas d\'approbation.',
        'awaiting_approval' => 'Ce reversement attend son approbation.',
        'amount_changed_since_approval' => 'Le montant a changé depuis l\'approbation : faites-le approuver à nouveau.',
        'payment_method_required' => 'Indiquez le moyen de paiement.',
        'reference_required' => 'La référence de la transaction est obligatoire hors espèces.',
        'unverified_destination' => 'Ce reversement ne part que vers une destination vérifiée du bénéficiaire, du moyen choisi.',
        'cannot_process' => 'Ce reversement ne peut pas être marqué payé dans son état actuel.',
        'cannot_fail' => 'Ce reversement ne peut pas être marqué échoué dans son état actuel.',
        'cannot_cancel' => 'Ce reversement ne peut pas être annulé dans son état actuel.',
        'failed_reason_required' => 'Le motif de l\'échec est obligatoire.',
    ],

    'threshold' => [
        'needs_two_approvers' => 'Le seuil d\'approbation exige au moins deux membres actifs habilités à approuver.',
    ],

    'platform' => [
        'agency_frozen' => 'Cette agence n\'est pas active : ses reversements sont gelés.',
        'agency_unverified' => 'Une agence non vérifiée ne peut pas être payée.',
        'already_closed' => 'Cette période est déjà clôturée pour cette agence.',
        'invalid_transition' => 'Ce reversement ne peut pas passer de :from à :to.',
    ],

    'invoice' => [
        'foreign_target' => 'Ce bail ou cette réservation ne relève pas de l\'agence de la facture.',
        'credit_note_final' => 'Un avoir ne s\'annule pas.',
        'credit_note_label' => 'Avoir',
        'credits_label' => 'Annule la facture :reference',
    ],

    'bill' => [
        'not_payable' => 'Seule une facture d\'intervention validée se paie.',
        'already_in_payout' => 'Cette facture d\'intervention est déjà dans un reversement en cours.',
        'not_pending' => 'Cette facture d\'intervention n\'attend plus de validation.',
    ],

    'payout_method' => [
        'already_verified' => 'Cette destination est déjà vérifiée.',
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

    'notifications' => [
        'greeting' => 'Bonjour,',
        'salutation' => 'L\'équipe Takussan',
        'payout_awaiting_approval' => [
            'subject' => 'Reversement :reference à approuver',
            'intro' => 'Le reversement :reference de :net_amount :currency attend votre approbation.',
        ],
        'payout_processed' => [
            'subject' => 'Reversement :reference effectué',
            'intro' => 'Un reversement de :net_amount :currency vous a été versé.',
            'reference_line' => 'Référence de la transaction : :transaction_id',
            'destination_line' => 'Destination : :destination',
        ],
        'payout_failed' => [
            'subject' => 'Reversement :reference en échec',
            'intro' => 'Le reversement :reference de :net_amount :currency n\'a pas abouti.',
            'reason_line' => 'Motif : :reason',
        ],
        'payout_due' => [
            'subject' => 'Reversement :reference à effectuer',
            'intro' => 'Le reversement :reference de :net_amount :currency est arrivé à échéance : effectuez-le, puis saisissez sa référence.',
        ],
        'payout_method_changed' => [
            'subject' => 'Votre destination de paiement a changé',
            'intro' => 'La destination de paiement :destination a été :action sur votre compte.',
            'warning' => 'Si vous n\'êtes pas à l\'origine de ce changement, contactez votre agence immédiatement.',
            'actions' => [
                'added' => 'ajoutée',
                'updated' => 'modifiée',
                'removed' => 'supprimée',
            ],
        ],
        'owner_statement_available' => [
            'subject' => 'Votre relevé de gérance :period est disponible',
            'intro' => 'Votre relevé de gérance pour :period est disponible dans votre espace.',
        ],
    ],
];
