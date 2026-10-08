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
        'direction_mismatch' => 'Crédit dañu koy rapprocher ak encaissement, débit ak reversement.',
        'csv_column' => 'Colonne dañu koy wone ak turu en-tête bi walla ak bérébam.',
        'payout_not_completed' => 'Reversement bu ñu yónnee rekk lañu mën rapprocher ak débit.',
        'file_not_utf8' => 'Fichier bi du UTF-8 : génnéel ko ci UTF-8 ci sa banque walla sa tableur.',
    ],

    'status' => [
        'processing' => 'Yee ngi ci jëfandikoo',
        'ready_for_review' => 'Da ngay xool',
        'partially_reconciled' => 'Yiite yu bari rapproché nañu',
        'reconciled' => 'Rapproché na',
        'archived' => 'Archivé',
        'failed' => 'Analyse bi antuwul',
    ],

    'line_status' => [
        'unmatched' => 'Matchée ul',
        'suggested' => 'Suggérée',
        'confirmed' => 'Rapprochée',
        'ignored' => 'Ignorée',
    ],
];
