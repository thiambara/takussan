<?php

return [
    'notifications' => [
        'imported' => [
            'title' => 'Relevé importé',
            'body' => 'Votre relevé :bank (:lines_count lignes) est prêt à être rapproché.',
        ],
        'finalized' => [
            'title' => 'Relevé clôturé',
            'body' => 'Le relevé :period a été clôturé (:confirmed/:total lignes rapprochées).',
        ],
    ],

    'validation' => [
        'duplicate_file' => 'Ce relevé a déjà été importé pour cette agence.',
        'currency_mismatch' => 'La devise de la ligne (:line) ne correspond pas à celle du paiement (:payment).',
        'cross_agency' => 'Le paiement ciblé n\'appartient pas à cette agence.',
        'already_reconciled' => 'Ce paiement est déjà rapproché à une autre ligne.',
        'statement_closed' => 'Ce relevé est clôturé, modification impossible.',
        'direction_mismatch' => 'Un crédit se rapproche d\'un encaissement, un débit d\'un reversement.',
        'csv_column' => 'Une colonne se désigne par son nom d\'en-tête ou par sa position.',
        'payout_not_completed' => 'Seul un reversement émis peut être rapproché d\'un débit.',
    ],

    'status' => [
        'processing' => 'En cours d\'analyse',
        'ready_for_review' => 'À vérifier',
        'partially_reconciled' => 'Partiellement rapproché',
        'reconciled' => 'Rapproché',
        'archived' => 'Archivé',
        'failed' => 'Échec de l\'analyse',
    ],

    'line_status' => [
        'unmatched' => 'Non matchée',
        'suggested' => 'Suggérée',
        'confirmed' => 'Rapprochée',
        'ignored' => 'Ignorée',
    ],
];
