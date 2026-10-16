<?php

// TCK-596 — textes du PDF d'état des lieux portés par une clé.
return [
    'pdf' => [
        'signed_on_behalf_of' => 'Signed by :signer on behalf of :landlord',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'signature' => [
        'invalid' => 'The signature is invalid.',
        'prefix' => 'The signature must be a base64 PNG (data:image/png;base64,...).',
        'base64' => 'The signature contains invalid base64 characters.',
        'too_small' => 'The signature is empty or too small.',
        'not_png' => 'The signature is not a valid PNG.',
    ],
];
