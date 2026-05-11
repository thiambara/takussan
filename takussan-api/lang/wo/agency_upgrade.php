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
    'review' => [
        'errors' => [
            'not_pending' => 'Demaande bi ñu ko def na — mënuñu ko soppi.',
            'permission_denied' => 'Amul nga ndombo-tànk ngir review demaande bi.',
            'comment_required' => 'Sumb bi ngir bañ moo war (5 caractères ci tasaaru).',
        ],
    ],
    'notifications' => [
        'submitted' => [
            'subject' => 'Bees demaande upgrade agence bi : :agency',
            'body' => ':submitter (#:agency) yónni na demaande ngir mu yokku agence bi ci professionnel.',
            'action' => 'Xool demaande bi',
        ],
        'approved' => [
            'subject' => 'Demaande sa upgrade bi nangu nañu ko',
            'body' => 'Demaande sa upgrade bi nangu nañu ko. Agence sa nekk na ci professionnel léegi.',
            'action' => 'Dem ci sa espace',
        ],
        'rejected' => [
            'subject' => 'Demaande sa upgrade bi bañ nañu ko',
            'body' => 'Demaande sa upgrade bi bañ nañu ko. Sumb bi : :comment',
            'action' => 'Yónni demaande bu bees',
        ],
    ],
];
