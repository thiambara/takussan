<?php

/*
 * TCK-592 — mbind yu domaine maintenance. Ci TCK-588 ci kanam, yégle code la
 * (`notifications.php` → `codes.maintenance*`) te tegglu code njuumte la (`errors.php` →
 * `maintenance.*`) ; li des fii : turu statut yi, tegglu validation yi, bataaxali sistem yu
 * waxtaan wi ak devis PDF bi.
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
        'not_assignable' => 'Compte bii mënul jot liggéey bii : war na doon prestataire bu dox te am collaboration bu dox ak agence bi moom kër gi, walla ku bokk ci équipe bi.',
        'invitation_request_invalid' => 'Laaj liggéey bi ñu boole ci war na bokk ci agence bii te bañ a doon lu ñu tëj walla neenal.',
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
