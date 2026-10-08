<?php

// TCK-597 (verif-597 m5) — les motifs de modération codés (`ModerationReasonCode`), traduits au
// rendu d'une notification : le destinataire ne lit jamais le code brut. Mêmes libellés que le front
// (`common.moderationReasons`).
return [
    'reasons' => [
        'fraud' => 'Njuuj walla naxe',
        'spam' => 'Spam',
        'misleading' => 'Lu dul dëgg',
        'offensive' => 'Wax yu ñaaw',
        'personal_data' => 'Xibaar yu bopp',
        'duplicate' => 'Ñaari yoon',
        'conflict_of_interest' => 'Njariñ boo xam ne dafa am',
        'off_topic' => 'Bokkul ci',
        'other' => 'Leneen',
    ],
];
