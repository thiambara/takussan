<?php

// TCK-2981 (ADR-0132) — what the bridge sends over WhatsApp and SMS (the front never sees it).
return [
    'bouton_accepter' => 'Accept messages',
    'invitation' => ':agence would like to write to you on WhatsApp about “:sujet”. Do you agree to receive their messages here? Reply STOP at any time to stop.',
    'relais' => ':nom (:agence): :texte',
    'relais_sms' => ':nom (:agence): :texte — reply on WhatsApp or in Takussan.',
    // TCK-2982 (ADR-0132 § 5) — le lien d'action relayé : l'URL dans le texte (un canal sans bouton la lit là).
    'lien_action' => 'The link below lets you :geste without signing in. It is valid for 7 days and works only once: :url',
    // Le corps du gabarit `pont_lien_action` ({{1}} l'agence, {{2}} le geste ; le bouton porte l'URL).
    'lien_action_gabarit' => '{{1}} invites you to {{2}}. Open the link to do it without signing in; it is valid for 7 days and works only once.',
    'gestes' => [
        'property_visit.confirm' => 'confirm the visit',
        'maintenance_request.accept' => 'accept the job',
        'inventory.sign' => 'sign the inventory',
    ],
];
