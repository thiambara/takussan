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
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'rejection_reason' => [
        'required' => 'Sabab bu ñu ko bañe dafa war.',
        'min' => 'Sabab bi war na am lu mu néew 20 araf.',
        'max' => 'Sabab bi du mën a ëpp 1000 araf.',
    ],
];
