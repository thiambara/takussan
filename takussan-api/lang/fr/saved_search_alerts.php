<?php

// TCK-599 (ADR-0050 §3) — les alertes de recherche, dans la langue du destinataire.
return [
    'default_name' => 'Ma recherche',
    'title' => 'Nouveaux biens pour « :name »',
    'body' => '{1} Un nouveau bien correspond à votre recherche « :name ».|[2,*] :total nouveaux biens correspondent à votre recherche « :name ».',
    'mail' => [
        'greeting' => 'Bonjour,',
        'see_all' => '{1} Voir le résultat|[2,*] Voir les :total résultats',
        'more' => '{1} Et un autre bien sur Takussan.|[2,*] Et :count autres biens sur Takussan.',
        'view_property' => 'Voir le bien',
        'unsubscribe' => 'Ne plus recevoir cette alerte',
        'reason' => 'Vous recevez cet e-mail parce que vous avez créé l’alerte « :name » sur Takussan.',
    ],
    'whatsapp' => '{1} Un nouveau bien pour « :name » : :url|[2,*] :total nouveaux biens pour « :name » : :url',
    'confirm' => [
        'mail' => [
            'subject' => 'Confirmez votre alerte Takussan',
            'greeting' => 'Bonjour,',
            'intro' => 'Vous avez demandé à être prévenu des nouveaux biens qui correspondent à votre recherche. Rien ne vous sera envoyé tant que vous n’aurez pas confirmé.',
            'action' => 'Confirmer mon alerte',
            'expire' => 'Ce lien expire dans :hours heures.',
            'ignore' => 'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : elle sera effacée.',
        ],
    ],
];
