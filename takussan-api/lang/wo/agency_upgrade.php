<?php

return [
    'submit' => [
        'errors' => [
            'not_individual' => 'Agence bi xam-xam la — luñu tëju ci upgrade.',
            'permission_denied' => 'Amul nga ndombo-tànk ngir yónni demaande upgrade ci agence bi.',
            'pending_exists' => 'Demaande dafa nekk ci agence bii (#:request_id). Révoque-leen balaa nga yónni beneen.',
        ],
    ],
    'revoke' => [
        'errors' => [
            'not_pending' => 'Demaande yi nekk ci en attente rekk lañu mën a révoque.',
            'permission_denied' => 'Amul nga ndombo-tànk ngir révoque demaande bi.',
        ],
    ],
    'notifications' => [
        'submitted' => [
            'subject' => 'Bees demaande upgrade agence bi : :agency',
            'body' => ':submitter (#:agency) yónni na demaande ngir mu yokku agence bi ci professionnel.',
            'action' => 'Xool demaande bi',
        ],
    ],
];
