<?php

// TCK-596 — textes du PDF d'état des lieux portés par une clé.
return [
    'pdf' => [
        'signed_on_behalf_of' => 'Signé par :signer pour le compte de :landlord',
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
