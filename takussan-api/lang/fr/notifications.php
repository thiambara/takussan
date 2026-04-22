<?php

return [

    'salutation' => 'L\'équipe Takussan',

    'registration' => [
        'subject' => 'Confirmez votre adresse e-mail',
        'greeting' => 'Bienvenue sur Takussan !',
        'intro' => 'Veuillez confirmer votre adresse e-mail en cliquant sur le bouton ci-dessous.',
        'action' => 'Vérifier l\'e-mail',
        'expire' => 'Ce lien de vérification expirera dans :count minutes.',
        'ignore' => 'Si vous n\'avez pas créé de compte, aucune action supplémentaire n\'est requise.',
    ],

    'password_reset' => [
        'subject' => 'Réinitialisation de votre mot de passe',
        'greeting' => 'Bonjour !',
        'intro' => 'Vous recevez cet e-mail car nous avons reçu une demande de réinitialisation de mot de passe pour votre compte.',
        'action' => 'Réinitialiser le mot de passe',
        'expire' => 'Ce lien de réinitialisation expirera dans :count minutes.',
        'ignore' => 'Si vous n\'avez pas demandé de réinitialisation, aucune action supplémentaire n\'est requise.',
    ],

    'new_booking' => [
        'subject' => 'Nouvelle réservation #:reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre réservation #:reference a été créée et est en attente de confirmation.',
        'details' => 'Séjour : du :start au :end.',
    ],

    'digest' => [
        'subject' => 'Votre récapitulatif Takussan (:count nouvelles)',
        'greeting' => 'Bonjour,',
        'intro' => 'Voici un résumé des notifications reçues depuis hier.',
        'footer' => 'Consultez le centre de notifications pour voir toutes vos alertes.',
    ],
];
