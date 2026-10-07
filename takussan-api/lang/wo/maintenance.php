<?php

/*
 * TCK-592 — mbind yu domaine maintenance. API bi du bind benn kàddu ci loxo : yégle yépp ak
 * tegglu yépp ñu ngi jaar ci benn caabi ci fichier bii, ci làkku ku koy jot.
 */
return [
    'status' => [
        'open' => 'ubbeeku',
        'acknowledged' => 'jot nañu ko',
        'quote_requested' => 'devis laaj nañu ko',
        'quote_submitted' => 'devis yónnee nañu ko',
        'awaiting_owner' => 'mungi xaar boroom kër gi',
        'approved' => 'devis nangu nañu ko',
        'rejected' => 'devis bañ nañu ko',
        'assigned' => 'jox nañu ko ku koy def',
        'in_progress' => 'liggéey bi dafa ndeyi',
        'completed' => 'liggéey bi jeex na',
        'closed' => 'tëj nañu ko',
        'cancelled' => 'neenal nañu ko',
    ],

    'errors' => [
        'transition_not_allowed' => 'Jóge ci « :from » dem ci « :to » sañuñu ko.',
        'dedicated_endpoint' => 'Soppi statut bii am na yoonam bu ko moom, du jaar ci statut bu ñépp.',
        'not_assignable' => 'Compte bii mënul jot liggéey bii : war na doon prestataire bu dox te am collaboration bu dox ak agence bi moom kër gi, walla ku bokk ci équipe bi.',
        'decline_after_accept' => 'Liggéey bi nangu nañu ko walla tàmbali nañu ko ba noppi : mënatul a bañ.',
        'already_accepted' => 'Liggéey bi nangu nañu ko ba noppi.',
        'terminal_request' => 'Laaj bu ñu tëj walla bu ñu neenal jotatul benn fichier.',
        'cost_ambiguous' => 'Joxeel « cost » walla « actual_cost », bul jox ñoom ñaar.',
        'before_photos_requires_acceptance' => 'Nataal yu « laata » yi, prestataire bi nangu liggéey bi rekk moo leen mën a yónnee.',
        'quote_expired' => 'Devis bii amatul solo : bisu jeexitalam wees na.',
        'invitation_request_invalid' => 'Laaj liggéey bi ñu boole ci war na bokk ci agence bii te bañ a doon lu ñu tëj walla neenal.',
        'collaboration_transition' => 'Soppi statut collaboration bii sañuñu ko.',
    ],

    'notifications' => [
        'created' => [
            'title' => 'Laaj liggéey bu bees',
            'body' => 'Am na laaj liggéey bu ñu yónnee ngir :property : « :title ».',
        ],
        'assigned' => [
            'title' => 'Liggéey bu bees : :title',
            'body' => 'Jox nañu la benn liggéey ci :property. Nangu ko walla bañ ko ci xëtam.',
        ],
        'unassigned' => [
            'title' => 'Liggéey bi jële nañu ko : :title',
            'body' => 'Liggéey bi « :title » jotatuloo ko.',
        ],
        'accepted' => [
            'title' => 'Liggéey bi nangu nañu ko : :title',
            'body' => ':provider nangu na liggéey bi « :title ».',
        ],
        'declined' => [
            'title' => 'Liggéey bi bañ nañu ko : :title',
            'body' => ':provider bañ na liggéey bi « :title ». Lu tax : :reason',
        ],
        'quote_requested' => [
            'title' => 'Devis laaj nañu ko : :title',
            'body' => 'Dañu lay laaj benn devis ngir liggéey bi « :title ».',
        ],
        'quote_submitted' => [
            'title' => 'Devis yónnee nañu ko : :title',
            'body' => 'Benn devis bu :amount yónnee nañu ko ngir liggéey bi « :title ».',
        ],
        'quote_awaiting_owner' => [
            'title' => 'Sa ndigal la ñuy xaar : :title',
            'body' => 'Benn devis bu :amount ngir « :title » ëpp na plafond bi nga déggoo ak sa agence. Nangu ko walla bañ ko.',
        ],
        'quote_approved' => [
            'title' => 'Devis nangu nañu ko : :title',
            'body' => 'Sa devis ngir liggéey bi « :title » nangu nañu ko.',
        ],
        'quote_rejected' => [
            'title' => 'Devis bañ nañu ko : :title',
            'body' => 'Sa devis ngir liggéey bi « :title » bañ nañu ko. Lu tax : :reason',
        ],
        'completed' => [
            'title' => 'Liggéey bi jeex na : :title',
            'body' => 'Prestataire bi jeexal na liggéey bi « :title ». Ki laaj war na wóoral ne defar nañu ko.',
        ],
        'confirmed' => [
            'title' => 'Defar bi wóor na : :title',
            'body' => 'Ki laaj wóoral na defar bi : liggéey bi « :title » tëj nañu ko.',
        ],
        'contested' => [
            'title' => 'Defar bi ñu ngi koy weddi : :title',
            'body' => 'Jafe-jafe bi des na ci « :title ». Kàddu : :comment',
        ],
        'auto_closed' => [
            'title' => 'Liggéey bi tëj nañu ko : :title',
            'body' => 'Ndax tontu amul ci :days fan, liggéey bi « :title » tëju na ci boppam.',
        ],
        'cancelled' => [
            'title' => 'Liggéey bi neenal nañu ko : :title',
            'body' => 'Liggéey bi « :title » neenal nañu ko.',
        ],
        'step' => [
            'title' => 'Sa laaj « :title » : :status',
            'body' => 'Sa laaj liggéey léegi mungi : :status.',
            'body_scheduled' => 'Sa laaj liggéey léegi mungi : :status. Prestataire bi dina ñëw ci :date.',
        ],
    ],

    'system' => [
        'assigned' => 'Liggéey bi jox nañu ko :provider.',
        'unassigned' => 'Liggéey bi jotatul :provider.',
        'accepted' => ':provider nangu na liggéey bi.',
        'declined' => ':provider bañ na liggéey bi.',
        'status' => 'Statut : :status.',
    ],

    'quote_pdf' => [
        'title' => 'Devis liggéey',
        'request' => 'Liggéey',
        'property' => 'Kër',
        'provider' => 'Prestataire',
        'submitted_at' => 'Yónnee nañu ko ci',
        'valid_until' => 'Am na solo ba',
        'duration' => 'Diir bu ñu xaar',
        'duration_days' => ':days fan',
        'label' => 'Lu ñu def',
        'kind' => 'Xeet',
        'quantity' => 'Limu',
        'unit_price' => 'Njëg benn',
        'line_total' => 'Mboole',
        'total' => 'Mbooleem devis bi',
        'kinds' => [
            'labour' => 'Liggéey loxo',
            'supply' => 'Jumtukaay',
        ],
    ],
];
