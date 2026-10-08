<?php

// TCK-597 (verif-597 m5) — les motifs de modération codés (`ModerationReasonCode`), traduits au
// rendu d'une notification : le destinataire ne lit jamais le code brut. Mêmes libellés que le front
// (`common.moderationReasons`).
return [
    'reasons' => [
        'fraud' => 'Fraude ou arnaque',
        'spam' => 'Spam',
        'misleading' => 'Contenu trompeur',
        'offensive' => 'Propos injurieux',
        'personal_data' => 'Données personnelles',
        'duplicate' => 'Doublon',
        'conflict_of_interest' => 'Conflit d\'intérêts',
        'off_topic' => 'Hors sujet',
        'other' => 'Autre motif',
    ],
];
