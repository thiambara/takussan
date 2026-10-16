<?php

// TCK-596 — textes du PDF d'état des lieux portés par une clé.
return [
    'pdf' => [
        'signed_on_behalf_of' => 'Xaatim na ko :signer ci turu :landlord',
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
