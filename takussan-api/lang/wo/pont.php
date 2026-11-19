<?php

// TCK-2981 (ADR-0132) — wolof en pause : le français tel quel. Les textes que le pont envoie sur WhatsApp et par SMS (le front ne les voit pas).
return [
    'bouton_accepter' => 'Accepter les messages',
    'invitation' => ':agence souhaite vous écrire sur WhatsApp à propos de « :sujet ». Acceptez-vous de recevoir ses messages ici ? Répondez STOP à tout moment pour arrêter.',
    'relais' => ':nom (:agence) : :texte',
    'relais_sms' => ':nom (:agence) : :texte — répondez sur WhatsApp ou dans Takussan.',
    // TCK-2982 (ADR-0132 § 5) — le lien d'action relayé : l'URL dans le texte (un canal sans bouton la lit là).
    'lien_action' => "Le lien ci-dessous permet de :geste, sans vous connecter. Il est valable 7 jours et ne sert qu'une fois : :url",
    // Le corps du gabarit `pont_lien_action` ({{1}} l'agence, {{2}} le geste ; le bouton porte l'URL).
    'lien_action_gabarit' => "{{1}} vous invite à {{2}}. Ouvrez le lien pour le faire sans vous connecter ; il est valable 7 jours et ne sert qu'une fois.",
    'gestes' => [
        'property_visit.confirm' => 'confirmer la visite',
        'maintenance_request.accept' => "accepter l'intervention",
        'inventory.sign' => "signer l'état des lieux",
    ],
];
