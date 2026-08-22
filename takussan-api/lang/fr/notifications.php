<?php

return [

    'salutation' => 'L\'équipe Takussan',

    // TCK-249 — Invitation lifecycle emails (initial + reminder + inviter
    // notifications on acceptance/expiration).
    'invitation' => [
        'subject' => 'Vous avez reçu une invitation Takussan',
        'reminder_subject' => 'Rappel — votre invitation Takussan',
        'greeting' => 'Bonjour,',
        'intro' => 'Vous avez été invité(e) à rejoindre Takussan en tant que :role.',
        'reminder_intro' => 'Petit rappel : votre invitation Takussan en tant que :role est toujours en attente.',
        'action' => 'Accepter l\'invitation',
        'expires_at' => 'Ce lien expire le :date.',
        'ignore' => 'Si cette invitation ne vous concerne pas, vous pouvez ignorer cet e-mail.',
    ],

    'invitation_accepted' => [
        'subject' => ':email a accepté votre invitation',
        'greeting' => 'Bonjour,',
        'intro' => ':email vient d\'accepter votre invitation et a rejoint la plateforme en tant que :role.',
    ],

    'invitation_expired' => [
        'subject' => 'Votre invitation à :email a expiré',
        'greeting' => 'Bonjour,',
        'intro' => 'L\'invitation que vous aviez envoyée à :email a expiré sans être acceptée.',
        'advice' => 'Vous pouvez la renvoyer depuis votre tableau de bord pour relancer le destinataire.',
    ],

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
        'sms' => 'Takussan : votre réservation #:reference est en attente de confirmation. Séjour du :start au :end.',
    ],

    'digest' => [
        'subject' => 'Votre récapitulatif Takussan (:count nouvelles)',
        'greeting' => 'Bonjour,',
        'intro' => 'Voici un résumé des notifications reçues depuis hier.',
        'footer' => 'Consultez le centre de notifications pour voir toutes vos alertes.',
        'see_all' => 'Voir toutes les notifications',
        'unsubscribe' => 'Se désabonner des e-mails récapitulatifs',
    ],

    'types' => [
        'booking' => 'Réservations',
        'payment' => 'Paiements',
        'lease' => 'Baux',
        'maintenance' => 'Maintenance',
        'visit' => 'Visites',
        'message' => 'Messages',
        'system' => 'Système',
        'bank_statement_imported' => 'Relevé bancaire importé',
        'bank_statement_finalized' => 'Relevé bancaire clôturé',
        'role_delegated' => 'Délégation de rôle',
        'role_delegation_expired' => 'Délégation expirée',
        'role_delegation_revoked' => 'Délégation révoquée',
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

    // TCK-272 — code de step-up pour les comptes sans mot de passe
    // utilisable (OAuth, invitation, provisioning). Pas de lien cliquable :
    // c'est la confirmation d'un acte destructif, pas une invitation à agir.
    'account_deletion_step_up' => [
        'subject' => 'Votre code de confirmation de suppression de compte',
        'greeting' => 'Bonjour,',
        'intro' => 'Voici le code à saisir pour confirmer la suppression de votre compte :',
        'expires' => 'Ce code est valable :minutes minutes et ne peut servir qu\'une seule fois.',
        'ignore' => 'Si vous n\'êtes pas à l\'origine de cette demande, ignorez cet e-mail : sans ce code, rien ne sera supprimé.',
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

    // TCK-265 — one-shot welcome notification fired on Lease.activated.
    'tenant_welcome' => [
        'subject' => 'Bienvenue chez vous — bail :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre bail :reference est désormais actif.',
        'body' => 'Retrouvez vos prochaines échéances, demandez une intervention et accédez à vos documents depuis votre espace résident.',
        'action' => 'Ouvrir mon espace résident',
    ],

    // TCK-266 — J+7 reminder when the move-in inventory is still unsigned.
    'tenant_inventory_reminder' => [
        'subject' => 'Rappel — état des lieux à signer (bail :reference)',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre état des lieux d\'entrée pour le bail :reference n\'a pas encore été signé.',
        'body' => 'Sans état des lieux signé, votre dossier reste incomplet. Connectez-vous à votre espace résident pour finaliser la signature.',
        'action' => 'Signer l\'état des lieux',
    ],

    'agent_tenant_inventory_reminder' => [
        'subject' => 'Locataire en retard sur son EDL — bail :reference',
        'greeting' => 'Bonjour,',
        'intro' => ':tenant n\'a pas encore signé l\'état des lieux d\'entrée du bail :reference (plus de 7 jours).',
        'body' => 'Vérifiez avec votre locataire si une relance ou une assistance est nécessaire pour finaliser la signature.',
        'action' => 'Voir les onboardings en retard',
        'unknown_tenant' => 'Le locataire',
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

    'lease_rent_reviewed' => [
        'subject' => 'Révision du loyer — bail :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Le loyer mensuel du bail :reference a été révisé : :old → :new :currency.',
        'effective' => 'Date d\'effet : :date.',
        'reason' => 'Motif : :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Rappel — facture :reference en retard',
        'greeting' => 'Bonjour,',
        'intro' => 'La facture :reference est en retard de :days jours (échéance : :due_date).',
        'amount' => 'Montant dû : :amount :currency.',
        'cta' => 'Merci de procéder au règlement dès que possible pour éviter de nouveaux rappels.',
    ],

    'booking_expired' => [
        'subject' => 'Demande de réservation #:reference expirée',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre demande de réservation #:reference pour :property a expiré.',
        'expired_reason' => 'La demande de réservation n\'a pas reçu de réponse dans le délai imparti par l\'agence.',
        'next_steps' => 'Vous pouvez soumettre une nouvelle demande si le bien est toujours disponible.',
        'unknown_property' => 'Bien inconnu',
    ],

    // Titre du feed in-app pour ThresholdAlertTriggered — la seule des six classes
    // dotées d'un toAppNotification() dont le sujet e-mail était codé en dur.
    'threshold_alert' => [
        'title' => 'Alerte KPI — :metric',
    ],
];
