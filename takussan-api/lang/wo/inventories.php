<?php

// TCK-596 — textes du PDF d'état des lieux portés par une clé.
return [
    'pdf' => [
        'signed_on_behalf_of' => 'Xaatim na ko :signer ci turu :landlord',
        // P192.04 — libellés des enums imprimés par l'acte, repris mot pour mot du front
        // (`inventory.conditions.*`, `inventory.status.*`). Texte français tel quel :
        // le wolof est en pause depuis le 2026-10-16.
        'conditions' => [
            'excellent' => 'Excellent',
            'good' => 'Bon',
            'fair' => 'Correct',
            'poor' => 'Mauvais',
        ],
        'statuses' => [
            'draft' => 'Brouillon',
            'pending_signature' => 'En attente de signature',
            'signed' => 'Signé',
            'disputed' => 'En litige',
        ],
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'signature' => [
        'invalid' => 'Xaatim bi baaxul.',
        'prefix' => 'Xaatim bi war na doon PNG base64 (data:image/png;base64,...).',
        'base64' => 'Xaatim bi am na araf base64 yu baaxul.',
        'too_small' => 'Xaatim bi amul dara walla dafa tuuti lool.',
        'not_png' => 'Xaatim bi du PNG bu baax.',
    ],
];
