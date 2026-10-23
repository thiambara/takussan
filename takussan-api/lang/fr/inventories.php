<?php

// TCK-596 — textes du PDF d'état des lieux portés par une clé.
return [
    'pdf' => [
        'signed_on_behalf_of' => 'Signé par :signer pour le compte de :landlord',
        // P192.04 — libellés des enums imprimés par l'acte, repris mot pour mot du front
        // (`inventory.conditions.*`, `inventory.status.*`).
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
        'invalid' => 'La signature est invalide.',
        'prefix' => 'La signature doit être un PNG base64 (data:image/png;base64,...).',
        'base64' => 'La signature contient des caractères base64 invalides.',
        'too_small' => 'La signature est vide ou trop petite.',
        'not_png' => 'La signature n\'est pas un PNG valide.',
    ],
];
