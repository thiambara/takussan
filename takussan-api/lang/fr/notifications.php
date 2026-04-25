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

    'visit_requested' => [
        'subject' => 'Nouvelle demande de visite pour :property',
        'greeting' => 'Bonjour,',
        'intro' => 'Un visiteur a demandé une visite pour :property.',
        'schedule' => 'Créneau demandé : :datetime.',
    ],

    'visit_confirmed' => [
        'subject' => 'Visite confirmée pour :property',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre demande de visite pour :property est confirmée.',
        'schedule' => 'Planifiée le : :datetime.',
    ],

    'visit_reminder' => [
        'subject' => 'Rappel : visite à venir pour :property',
        'greeting' => 'Bonjour,',
        'intro_24h' => 'Rappel — votre visite pour :property est prévue demain à :datetime.',
        'intro_1h' => 'Rappel — votre visite pour :property commence dans environ une heure, à :datetime.',
    ],

    'task_due_reminder' => [
        'subject' => 'Rappel : tâche due bientôt — :title',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre tâche « :title » est due demain à :datetime.',
    ],
  
    'account_deletion_requested' => [
        'subject' => 'Demande de suppression de compte enregistrée',
        'greeting' => 'Bonjour,',
        'intro' => 'Nous avons enregistré votre demande de suppression de compte. Elle sera exécutée le :date.',
        'consequences' => 'Vos données personnelles seront anonymisées de manière irréversible. Les enregistrements comptables et légaux (paiements, baux, factures) seront conservés sous forme anonyme conformément à la loi.',
        'action' => 'Annuler la suppression',
        'ignore' => 'Si vous n\'êtes pas à l\'origine de cette demande, annulez-la immédiatement et changez votre mot de passe.',
    ],

    'account_deletion_reminder' => [
        'subject' => 'Rappel : suppression de compte dans :days jours',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre compte sera supprimé dans :days jours, le :date. Si vous changez d\'avis, vous pouvez encore annuler la suppression.',
        'action' => 'Annuler la suppression',
        'ignore' => 'Si vous confirmez la suppression, aucune action n\'est requise.',
    ],

    'account_deletion_executed' => [
        'subject' => 'Votre compte a été supprimé',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre compte Takussan a été supprimé et vos données personnelles ont été anonymisées de manière irréversible.',
        'retention' => 'Conformément à nos obligations légales, certains enregistrements comptables (paiements, factures) sont conservés sous forme anonyme pendant 10 ans.',
        'contact' => 'Pour toute question, contactez notre service client.',
    ],
  
    'conversation_invite' => [
        'subject' => 'Invitation à un groupe : :subject',
        'greeting' => 'Bonjour,',
        'intro' => ':inviter vous a ajouté au groupe « :subject ».',
    ],
];
