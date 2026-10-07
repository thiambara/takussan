<?php

/*
 * TCK-594 (ADR-0039) — xaalis buy génn : reversements, ñeenti bët, destinations, factures.
 */
return [
    'segregation' => [
        'prepare' => 'Ki ñuy fey reversement bi warul ko waajal.',
        'approve' => 'Yaa waajal bii reversement, walla yaa koy jot : beneen membre war na ko nangu.',
        'pay' => 'Yaa nangu bii reversement, walla yaa koy jot : beneen membre war na ko màrke ni dañu ko fey.',
    ],

    'payout' => [
        'landlord_not_member' => 'Bii bailleur bokkul ci sa agence.',
        'agency_required' => 'Reversement dañu koy def ci turu agence.',
        'no_items' => 'Tudd benn encaissement walla benn facture d\'intervention.',
        'foreign_item' => 'Pièce n° :id bokkul ci bii agence walla bii bailleur.',
        'ineligible_item' => 'Pièce n° :id du encaissement bu ñu mën a delloo.',
        'foreign_destination' => 'Bii destination de paiement du yu ki ñuy fey.',
        'already_paid_out' => 'Benn ci pièce yi dañu ko delloo ba noppi.',
        'mixed_currencies' => 'Reversement du boole ñaari devise.',
        'negative_net' => 'Net bu reversement mënul a nekk ci suuf zéro.',
        'not_awaiting_approval' => 'Bii reversement du xaar ñu nangu ko.',
        'awaiting_approval' => 'Bii reversement mi ngi xaar ñu nangu ko.',
        'amount_changed_since_approval' => 'Montant bi soppiku na ginnaaw ba ñu ko nangoo : nangu ko ci kanam.',
        'payment_method_required' => 'Wax naka lañuy feyee.',
        'reference_required' => 'Référence bu transaction bi war na, su du ci espèces.',
        'unverified_destination' => 'Bii reversement mën na dem rekk ci destination bu ñu vérifier bu ki ñuy fey.',
        'cannot_process' => 'Mënuñoo màrke bii reversement ni dañu ko fey ci fi mu tollu.',
        'cannot_fail' => 'Mënuñoo màrke bii reversement ni lajj na ci fi mu tollu.',
        'cannot_cancel' => 'Mënuñoo far bii reversement ci fi mu tollu.',
        'failed_reason_required' => 'Lu waral lajj gi war na.',
    ],

    'threshold' => [
        'needs_two_approvers' => 'Seuil d\'approbation bi dafay laaj ñaari membre yu am sañ-sañ nangu.',
    ],

    'platform' => [
        'agency_frozen' => 'Bii agence du active : reversement yi dañu leen taxawal.',
        'agency_unverified' => 'Agence bu ñu vérifierul mënuñu ko fey.',
        'already_closed' => 'Bii période dañu ko tëj ba noppi ngir bii agence.',
        'invalid_transition' => 'Bii reversement mënul jóge :from dem :to.',
    ],

    'invoice' => [
        'foreign_target' => 'Bii bail walla bii réservation bokkul ci agence bu facture bi.',
        'credit_note_final' => 'Avoir mënuñu ko far.',
        'credit_note_label' => 'Avoir',
        'credits_label' => 'Dafay far facture :reference',
    ],

    'bill' => [
        'not_payable' => 'Facture d\'intervention bu ñu valider rekk lañuy fey.',
        'already_in_payout' => 'Bii facture d\'intervention mi ngi ci reversement bu ñu nekk di def.',
        'not_pending' => 'Bii facture d\'intervention du xaar validation.',
    ],

    'payout_method' => [
        'already_verified' => 'Bii destination dañu ko vérifier ba noppi.',
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
        'payouts' => 'Reversements',
        'reference' => 'Référence',
        'date' => 'Bés',
        'total' => 'Total',
        'agency' => 'Agence',
    ],

    'legal' => [
        'ninea' => 'NINEA',
        'rccm' => 'RCCM',
    ],

    'notifications' => [
        'greeting' => 'Salaam aleekum,',
        'salutation' => 'Mbootaayu Takussan',
        'payout_awaiting_approval' => [
            'subject' => 'Reversement :reference ngir nangu',
            'intro' => 'Reversement :reference bu :net_amount :currency mi ngi xaar nga nangu ko.',
        ],
        'payout_processed' => [
            'subject' => 'Reversement :reference dem na',
            'intro' => 'Reversement bu :net_amount :currency dañu la ko yónnee.',
            'reference_line' => 'Référence bu transaction bi : :transaction_id',
            'destination_line' => 'Destination : :destination',
        ],
        'payout_failed' => [
            'subject' => 'Reversement :reference lajj na',
            'intro' => 'Reversement :reference bu :net_amount :currency demul.',
            'reason_line' => 'Lu ko waral : :reason',
        ],
        'payout_due' => [
            'subject' => 'Reversement :reference war na',
            'intro' => 'Reversement :reference bu :net_amount :currency jot na : def ko, te bind référence bi.',
        ],
        'payout_method_changed' => [
            'subject' => 'Sa destination de paiement soppiku na',
            'intro' => 'Destination de paiement :destination dañu ko :action ci sa compte.',
            'warning' => 'Su dul yaa ko def, jokkool ak sa agence léegi.',
            'actions' => [
                'added' => 'yokk',
                'updated' => 'soppi',
                'removed' => 'far',
            ],
        ],
        'owner_statement_available' => [
            'subject' => 'Sa relevé de gérance :period am na',
            'intro' => 'Sa relevé de gérance bu :period mi ngi ci sa espace.',
        ],
    ],
];
