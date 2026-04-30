<?php

return [
    'notifications' => [
        'imported' => [
            'title' => 'Relevé importé',
            'body' => 'Sa relevé :bank (:lines_count lignes) dafa jëm ci rapprochement.',
        ],
        'finalized' => [
            'title' => 'Relevé clôturé',
            'body' => 'Relevé :period dañu ko tëj (:confirmed/:total lignes rapprochées).',
        ],
    ],

    'validation' => [
        'duplicate_file' => 'Bii relevé dañu ko wone nanu bii agence.',
        'currency_mismatch' => 'Devise bi ci ligne (:line) du benn ak devise bi ci paiement (:payment).',
        'cross_agency' => 'Bii paiement du ci bii agence.',
        'already_reconciled' => 'Bii paiement dañu ko rapprocher ak yeneen ligne.',
        'statement_closed' => 'Bii relevé dañu ko tëj, doo men soppi.',
    ],

    'status' => [
        'processing' => 'Yee ngi ci jëfandikoo',
        'ready_for_review' => 'Da ngay xool',
        'partially_reconciled' => 'Yiite yu bari rapproché nañu',
        'reconciled' => 'Rapproché na',
        'archived' => 'Archivé',
    ],

    'line_status' => [
        'unmatched' => 'Matchée ul',
        'suggested' => 'Suggérée',
        'confirmed' => 'Rapprochée',
        'ignored' => 'Ignorée',
    ],
];
