<?php

// TCK-597 (verif-597 m5) — les motifs de modération codés (`ModerationReasonCode`), traduits au
// rendu d'une notification : le destinataire ne lit jamais le code brut. Mêmes libellés que le front
// (`common.moderationReasons`).
return [
    'reasons' => [
        'fraud' => 'Fraud or scam',
        'spam' => 'Spam',
        'misleading' => 'Misleading content',
        'offensive' => 'Abusive language',
        'personal_data' => 'Personal data',
        'duplicate' => 'Duplicate',
        'conflict_of_interest' => 'Conflict of interest',
        'off_topic' => 'Off topic',
        'other' => 'Other reason',
    ],
];
