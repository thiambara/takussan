<?php

/**
 * TCK-080 — RGPD account deletion strings (WO).
 */
return [

    'deletion' => [
        'errors' => [
            'invalid_request' => 'Ñakk-na nu defar ndogalu suufeel bi.',
            'password_invalid' => 'Baatu jubaale baaxul.',
            'two_factor_required' => 'Code 2FA bi laaj na walla baaxul.',
            'has_obligations' => 'Am nga warug bën yu ñu suufeelul ba pare.',
            'no_pending_request' => 'Amul ndogalu suufeel bi gën a yàgg.',
            'already_executed' => 'Suufeel bi ëpp na, jaarewul.',
            'grace_expired' => 'Waxtu wu nga manon a baña la, jeexna.',

            // TCK-272 — voie de step-up alternative (code e-mail).
            'password_not_applicable' => 'Kont bii amul baatu jubaale : jëfandikool kod bi ñu la yónnee ci e-mail.',
            'step_up_not_applicable' => 'Kont bii am na baatu jubaale : jëfandikool sa baatu jubaale.',
            'step_up_code_required' => 'Kod bu dëggal bi laaj na.',
            'step_up_code_invalid' => 'Kod bu dëggal bi baaxul walla jeex na.',
        ],
        // TCK-272 — le message est volontairement invariant : il ne dit
        // jamais si un code a effectivement été émis.
        'step_up' => [
            'code_sent' => 'Su kont bii mënee jot kod, yónnee nañu ko léegi ci sa adrees e-mail.',
        ],

        'obligations' => [
            'lease_active' => 'Bail bi cay jaay :reference dafa war a paree.',
            'payment_pending' => 'Paye :reference duggul ba pare.',
            'invoice_pending' => 'Facture :reference dem ba pare.',
            'booking_open' => 'Réservation :reference daanu na.',
        ],
    ],

];
