<?php

// TCK-633 lot F (ADR-0061) — yégle yi ci kredi yi ak yokk gis-gisu yéenekaay yi.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Kredi yu bees dugg na ci sa bérab',
            'body' => 'Kredi yu dugg ci :agency : :credits. Ñu ngi jariñ ba :date.',
            'body_no_expiry' => 'Kredi yu dugg ci :agency : :credits.',
        ],
        'expiring' => [
            'title' => 'Ay kredi dinañu jeex ci kanam',
            'body' => 'Kredi yu :agency yuy jeex ci :date : :credits. Jëfandikoo leen ngir yokk gis-gisu say yéenekaay.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Yokk gis-gis gi jeex na',
            'body' => 'Yokk gis-gisu « :property » jeex na.',
        ],
        'refunded' => [
            'title' => 'Yokk gis-gis gi delloo nañu ko',
            'body' => 'Yokk gis-gisu « :property » taxaw na. Kredi yu ñu delloo : :credits.',
            'body_with_expired' => 'Yokk gis-gisu « :property » taxaw na. Kredi yu ñu delloo : :credits. Kredi yu ñu delloowul ndax seen jamono jeex na : :expired.',
        ],
    ],
];
