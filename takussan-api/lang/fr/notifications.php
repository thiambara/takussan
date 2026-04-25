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

    'lease_late_fee_applied' => [
        'subject' => 'Pénalité de retard appliquée sur le paiement :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Une pénalité de retard de :amount :currency a été appliquée au paiement :reference.',
        'details' => 'Calculée à :percent % du solde restant dû (:base :currency).',
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

    'lease_deposit_refunded' => [
        'subject' => 'Remboursement de la caution — bail :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre caution pour le bail :reference a été remboursée pour un montant de :amount :currency.',
        'retention' => 'Une retenue de :amount :currency a été appliquée. Motif : :reason.',
    ],

    'lease_renewed' => [
        'subject' => 'Votre bail a été renouvelé — :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Un avenant a été créé pour votre bail (:reference). Les nouvelles conditions sont désormais applicables.',
        'period' => 'Période : du :start au :end.',
    ],

    'lease_early_termination' => [
        'greeting' => 'Bonjour,',
        'penalty_line' => 'Pénalité de résiliation anticipée : :amount :currency. À régler avant la date effective.',
        'requested' => [
            'subject' => 'Résiliation anticipée demandée — bail :reference',
            'intro' => 'Une demande de résiliation anticipée a été initiée sur le bail :reference. Date effective : :date.',
        ],
        'cancelled' => [
            'subject' => 'Résiliation anticipée annulée — bail :reference',
            'intro' => 'La demande de résiliation anticipée du bail :reference a été annulée. Le bail reste actif.',
        ],
        'confirmed' => [
            'subject' => 'Bail résilié — :reference',
            'intro' => 'Le bail :reference est désormais clôturé à compter du :date.',
        ],
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Rappel — facture :reference en retard',
        'greeting' => 'Bonjour,',
        'intro' => 'La facture :reference est en retard de :days jours (échéance : :due_date).',
        'amount' => 'Montant dû : :amount :currency.',
        'cta' => 'Merci de procéder au règlement dès que possible pour éviter de nouveaux rappels.',
    ],
];
