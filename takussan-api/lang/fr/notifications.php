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

    'lease_late_fee_applied' => [
        'subject' => 'Pénalité de retard appliquée sur le paiement :reference',
        'greeting' => 'Bonjour,',
        'intro' => 'Une pénalité de retard de :amount a été appliquée au paiement :reference.',
        'details' => 'Calculée à :percent % du solde restant dû (:base).',
        // TCK-593 — ce que dit la notification est ce que dit l'écran (`late_fee_payable_online`).
        'pay_online' => 'Elle sera ajoutée au montant de votre paiement en ligne.',
        'pay_at_agency' => 'Elle est à régler auprès de votre agence ; elle ne sera pas demandée lors du paiement en ligne.',
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
        'intro' => 'Votre caution pour le bail :reference a été remboursée pour un montant de :amount.',
        'retention' => 'Une retenue de :amount a été appliquée. Motif : :reason.',
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
        'penalty_line' => 'Pénalité de résiliation anticipée : :amount. À régler avant la date effective.',
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
        'intro' => 'Le loyer mensuel du bail :reference a été révisé : :old → :new.',
        'effective' => 'Date d\'effet : :date.',
        'reason' => 'Motif : :reason',
    ],

    'invoice_reminder_sent' => [
        'subject' => 'Rappel — facture :reference en retard',
        'greeting' => 'Bonjour,',
        'intro' => 'La facture :reference est en retard de :days jours (échéance : :due_date).',
        'amount' => 'Montant dû : :amount.',
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

    // TCK-575 — l'e-mail de fin d'export RGPD. Rédigé en français en dur jusque-là : un
    // utilisateur `en` ou `wo` le recevait en français. Le lien mène à la page « Mes données »
    // du FRONT : l'ancien lien visait l'hôte de l'API, qui exige un jeton Bearer (401 au clic).
    'data_export_ready' => [
        'subject' => 'Votre export de données est prêt',
        'greeting' => 'Bonjour,',
        'intro' => 'Votre archive de portabilité Takussan est prête.',
        'action' => 'Ouvrir « Mes données »',
        'expires' => '{1} Elle reste téléchargeable depuis cette page pendant :count jour.|[2,*] Elle reste téléchargeable depuis cette page pendant :count jours.',
    ],

    // TCK-588 — alertes administrateur (canaux Slack, Discord, e-mail de l'exploitant).
    'admin_alert' => [
        'test_message' => '[TEST] :event déclenché par test synthétique.',
        'activity_message' => ':event — acteur :actor, objet :subject',
    ],

    // TCK-588 — salutation et bouton des e-mails rendus par code (CodedNotification).
    'greeting' => 'Bonjour,',
    'open' => 'Ouvrir',

    // TCK-588 (ADR-0032) — une notification est un CODE rendu par surface dans la langue du destinataire : `codes.<code>.<surface>` (title, body, sms ; mail_subject/mail_body retombent sur title/body ; `_link` quand le lien de paiement est fourni). LangGroupParityTest garde les trois langues.
    'codes' => [
        'impersonation' => [
            'ended' => [
                'title' => 'Votre compte a été consulté par l\'équipe Takussan',
                'body' => 'Un membre de l\'équipe Takussan, :operator, a consulté votre compte en lecture seule du :started_at au :ended_at. Motif : :reason. Aucune modification n\'a été faite en votre nom.',
                'sms' => 'Takussan : notre équipe a consulté votre compte en lecture seule (:operator). Détails dans vos notifications.',
            ],
        ],
        'agency' => [
            'suspended' => [
                'title' => 'Agence suspendue : :agency',
                'body' => 'L\'agence :agency est suspendue par la plateforme. Motif : :reason. Ses annonces ne sont plus publiées et son espace est en lecture seule.',
                'sms' => 'Takussan : l\'agence :agency est suspendue. Ses annonces sont retirées du site.',
            ],
            'reinstated' => [
                'title' => 'Suspension levée : :agency',
                'body' => 'La suspension de l\'agence :agency est levée. Motif : :reason. Ses annonces publiques sont de nouveau visibles.',
                'sms' => 'Takussan : la suspension de :agency est levée.',
            ],
        ],
        'platform_operator' => [
            'revoked' => [
                'title' => 'Opérateur retiré : :operator',
                'body' => 'L\'accès de :operator à la console plateforme a été retiré. Motif : :reason.',
                'sms' => 'Takussan : l\'accès de :operator à la console est retiré.',
            ],
        ],
        'lease_payment' => [
            'due_soon' => [
                'title' => 'Loyer à payer le :due_date',
                'body' => 'Votre loyer de :amount pour :property est dû le :due_date.',
                'body_link' => 'Votre loyer de :amount pour :property est dû le :due_date. Payer en ligne : :payment_url',
                'sms' => 'Takussan : loyer de :amount dû le :due_date (:property).',
                'sms_link' => 'Takussan : loyer de :amount dû le :due_date. Payer : :payment_url',
            ],
            'overdue' => [
                'title' => 'Loyer en retard',
                'body' => '{1} Votre loyer de :amount pour :property, dû le :due_date, est en retard de :days jour.|[0,*] Votre loyer de :amount pour :property, dû le :due_date, est en retard de :days jours.',
                'body_link' => '{1} Votre loyer de :amount pour :property, dû le :due_date, est en retard de :days jour. Payer en ligne : :payment_url|[0,*] Votre loyer de :amount pour :property, dû le :due_date, est en retard de :days jours. Payer en ligne : :payment_url',
                'sms' => '{1} Takussan : loyer de :amount en retard de :days jour (:property).|[0,*] Takussan : loyer de :amount en retard de :days jours (:property).',
                'sms_link' => '{1} Takussan : loyer de :amount en retard de :days jour. Payer : :payment_url|[0,*] Takussan : loyer de :amount en retard de :days jours. Payer : :payment_url',
            ],
            'overdue_landlord' => [
                'title' => 'Loyer impayé : :property',
                'body' => '{1} Le loyer de :amount de :tenant pour :property est en retard de :days jour.|[0,*] Le loyer de :amount de :tenant pour :property est en retard de :days jours.',
                'sms' => '{1} Takussan : loyer de :amount de :tenant (:property) en retard de :days jour.|[0,*] Takussan : loyer de :amount de :tenant (:property) en retard de :days jours.',
            ],
            'overdue_digest' => [
                'title' => '{1} :count loyer en retard|[0,*] :count loyers en retard',
                'body' => '{1} :count échéance de vos baux est en retard, pour un total de :total.|[0,*] :count échéances de vos baux sont en retard, pour un total de :total.',
                'sms' => '{1} Takussan : :count loyer en retard (:total).|[0,*] Takussan : :count loyers en retard (:total).',
            ],
            'recorded' => [
                'title' => 'Paiement enregistré',
                'body' => 'Votre paiement de :amount pour :property a été enregistré.',
                'sms' => 'Takussan : paiement de :amount enregistré (:property).',
            ],
            'received_landlord' => [
                'title' => 'Loyer reçu : :property',
                'body' => ':tenant a payé :amount pour :property.',
                'sms' => 'Takussan : :tenant a payé :amount (:property).',
            ],
        ],
        // TCK-593 — un double encaissement à rembourser, signalé aux admins de l'agence.
        'payment' => [
            'duplicate' => [
                'title' => 'Paiement encaissé deux fois',
                'body' => 'Un paiement en ligne de :amount a été reçu pour :reference, déjà réglée. Remboursez le payeur ou affectez la somme.',
                'sms' => 'Takussan : paiement de :amount reçu en double pour :reference. À rembourser ou affecter.',
            ],
            'duplicate_late_fee' => [
                'title' => 'Pénalité encaissée deux fois',
                'body' => 'La pénalité de retard de :amount pour :reference, déjà réglée à l\'agence, a aussi été encaissée en ligne. Remboursez le payeur ou affectez la somme.',
                'sms' => 'Takussan : pénalité de :amount encaissée en double pour :reference. À rembourser ou affecter.',
            ],
        ],
        'booking' => [
            'created' => [
                'title' => 'Nouvelle réservation',
                'body' => 'La réservation :reference a été demandée pour :property, du :start_date au :end_date.',
                'sms' => 'Takussan : nouvelle réservation :reference (:property).',
            ],
            'confirmed' => [
                'title' => 'Réservation confirmée',
                'body' => 'Votre réservation :reference pour :property, du :start_date au :end_date, est confirmée.',
                'sms' => 'Takussan : réservation :reference confirmée (:property, :start_date).',
            ],
            'rejected' => [
                'title' => 'Réservation refusée',
                'body' => 'Votre réservation :reference pour :property a été refusée.',
                'sms' => 'Takussan : réservation :reference refusée (:property).',
            ],
            'cancelled' => [
                'title' => 'Réservation annulée',
                'body' => 'Votre réservation :reference pour :property a été annulée.',
                'sms' => 'Takussan : réservation :reference annulée (:property).',
            ],
        ],
        // TCK-589 — invitation adressée à un numéro : le nom de l'agence seul, jamais un texte de l'invitant.
        'invitation' => [
            'received' => [
                'title' => 'Invitation de :agency',
                'body' => ':agency vous invite à rejoindre son équipe.',
                'sms' => 'Takussan : :agency vous invite à rejoindre son équipe. Acceptez ici : :url',
            ],
            'reminder' => [
                'title' => 'Rappel : invitation de :agency',
                'body' => 'Votre invitation à rejoindre :agency vous attend.',
                'sms' => 'Takussan : rappel — votre invitation à rejoindre :agency vous attend : :url',
            ],
        ],
        // TCK-589 p3-1 — avis à l'ANCIEN numéro remplacé, et au compte. Aucun numéro dans le texte.
        'account' => [
            'phone_changed' => [
                'title' => 'Numéro de téléphone remplacé',
                'body' => 'Le numéro de téléphone vérifié de votre compte a été remplacé. Si ce n\'est pas vous, contactez le support.',
                'sms' => 'Takussan : ce numéro n\'est plus celui de votre compte. Si vous n\'êtes pas à l\'origine de ce changement, contactez le support.',
            ],
            'blocked' => [
                'title' => 'Votre compte est bloqué',
                'body' => 'Votre compte Takussan a été bloqué par la plateforme. Motif : :reason. Contactez le support pour toute question.',
                'sms' => 'Takussan : votre compte est bloqué. Contactez le support.',
            ],
            'reactivated' => [
                'title' => 'Votre compte est réactivé',
                'body' => 'Votre compte Takussan a été réactivé. Motif : :reason. Vous pouvez vous reconnecter.',
                'sms' => 'Takussan : votre compte est réactivé.',
            ],
        ],
        'visit' => [
            'reminder' => [
                'title' => 'Rappel de visite : :property',
                'body' => 'Rappel : la visite de :property est prévue le :scheduled_at.',
                'sms' => 'Takussan : visite de :property le :scheduled_at.',
            ],
            'requested' => [
                'title' => 'Demande de visite : :property',
                'body' => 'Créneau demandé : :scheduled_at. Pour joindre le visiteur : :contact.',
                'mail_body' => "Une demande de visite pour :property.\nCréneau demandé : :scheduled_at (fuseau :timezone).\nPour joindre le visiteur : :contact.",
                'sms' => 'Takussan : demande de visite pour :property le :scheduled_at (:timezone).',
            ],
            'rescheduled_by_visitor' => [
                'title' => 'Autre créneau proposé : :property',
                'body' => 'Le visiteur propose le :scheduled_at. La visite attend votre confirmation.',
                'mail_body' => "Le visiteur a proposé un autre créneau pour :property. La visite attend votre confirmation.\nCréneau proposé : :scheduled_at (fuseau :timezone).",
                'sms' => 'Takussan : le visiteur propose le :scheduled_at (:timezone) pour :property.',
            ],
            'cancelled_by_visitor' => [
                'title' => 'Visite annulée par le visiteur : :property',
                'body' => 'Le visiteur a annulé la visite prévue le :scheduled_at.',
                'mail_body' => "Le visiteur a annulé sa visite de :property.\nElle était prévue le :scheduled_at (fuseau :timezone).",
                'sms' => 'Takussan : le visiteur a annulé la visite de :property du :scheduled_at (:timezone).',
            ],
            'confirmed' => [
                'title' => 'Visite confirmée : :property',
                'body' => 'Votre visite de :property est confirmée le :scheduled_at.',
                'mail_body' => "Votre demande de visite pour :property est confirmée.\nPlanifiée le :scheduled_at (fuseau :timezone).",
                'sms' => 'Takussan : votre visite de « :property » est confirmée le :scheduled_at (:timezone).',
            ],
            'rescheduled' => [
                'title' => 'Votre visite de :property change d\'heure',
                'body' => 'Nouvel horaire : :scheduled_at.',
                'mail_body' => "L'agence a déplacé votre visite de :property.\nNouvel horaire : :scheduled_at (fuseau :timezone).",
                'sms' => 'Takussan : votre visite de « :property » est déplacée au :scheduled_at (:timezone).',
            ],
            'cancelled' => [
                'title' => 'Votre visite de :property est annulée',
                'body' => 'La visite prévue le :scheduled_at est annulée.',
                'mail_body' => "L'agence a annulé votre visite de :property.\nElle était prévue le :scheduled_at (fuseau :timezone).",
                'sms' => 'Takussan : votre visite de « :property » prévue le :scheduled_at (:timezone) est annulée.',
            ],
        ],
        'message' => [
            'received' => [
                'title' => 'Nouveau message de :sender',
                'body' => ':sender : :excerpt',
                'sms' => 'Takussan : nouveau message de :sender.',
            ],
        ],
        'lead' => [
            'received' => [
                'title' => 'Nouvelle demande de :name — :contact',
                'body' => ':name (:contact) : :message',
                'sms' => 'Takussan : nouvelle demande de :name.',
            ],
            'acknowledged' => [
                'title' => 'Votre demande a bien été transmise',
                'body' => 'Votre demande concernant « :about » a bien été transmise. Vous recevrez une réponse au plus vite, par téléphone ou par e-mail.',
                'sms' => 'Takussan : votre demande concernant :about a été transmise.',
            ],
        ],
        'governance' => [
            'role_capabilities_changed' => [
                'title' => 'Droits d\'un rôle modifiés',
                'body' => 'Les droits du rôle :role ont été modifiés par :actor.',
                'sms' => 'Takussan : droits du rôle :role modifiés par :actor.',
            ],
            'admin_added' => [
                'title' => 'Nouvel administrateur',
                'body' => 'Un accès administrateur a été donné à :member par :actor.',
                'sms' => 'Takussan : :member est désormais administrateur (par :actor).',
            ],
            'data_exported' => [
                'title' => 'Export de données',
                'body' => 'Un export de données clients a été effectué par :actor.',
                'sms' => 'Takussan : export de données clients par :actor.',
            ],
            'integration_changed' => [
                'title' => 'Intégration modifiée',
                'body' => 'L\'intégration :provider a été modifiée par :actor.',
                'sms' => 'Takussan : intégration :provider modifiée par :actor.',
            ],
            'approval_threshold_changed' => [
                'title' => 'Seuil d\'approbation modifié',
                'body' => 'Le seuil d\'approbation des reversements a été modifié par :actor.',
                'sms' => 'Takussan : seuil d\'approbation modifié par :actor.',
            ],
        ],
        'kyc' => [
            'expiring_soon' => [
                'title' => 'Pièce KYC bientôt expirée',
                'body' => 'La pièce d\'identité du dirigeant expire le :expires_at. Déposez-en une nouvelle pour garder l\'agence vérifiée.',
                'sms' => 'Takussan : la pièce KYC du dirigeant expire le :expires_at.',
            ],
            'submitted' => [
                'title' => 'KYC d\'agence à instruire',
                'body' => 'Le dossier KYC de :agency a été soumis.',
                'sms' => 'Takussan : KYC de :agency à instruire.',
            ],
            'verified' => [
                'title' => 'KYC d\'agence vérifié',
                'body' => 'Votre dossier KYC a été vérifié.',
                'sms' => 'Takussan : votre dossier KYC est vérifié.',
            ],
            'rejected' => [
                'title' => 'KYC d\'agence rejeté',
                'body' => 'Votre dossier KYC a été rejeté : :reason',
                'sms' => 'Takussan : votre dossier KYC a été rejeté.',
            ],
        ],
        'role_delegation' => [
            'activated' => [
                'title' => 'Rôle délégué — :role',
                'body' => 'Vous avez reçu le rôle :role jusqu\'au :ends_at.',
                'sms' => 'Takussan : rôle :role reçu jusqu\'au :ends_at.',
            ],
            'activated_delegator' => [
                'title' => 'Rôle délégué — :role',
                'body' => 'La délégation à :beneficiary pour le rôle :role est maintenant active.',
                'sms' => 'Takussan : délégation :role à :beneficiary active.',
            ],
            'expired' => [
                'title' => 'Délégation expirée — :role',
                'body' => 'Votre délégation pour le rôle :role a pris fin.',
                'sms' => 'Takussan : délégation :role terminée.',
            ],
            'expired_delegator' => [
                'title' => 'Délégation expirée — :role',
                'body' => 'La délégation à :beneficiary pour le rôle :role a expiré.',
                'sms' => 'Takussan : délégation :role à :beneficiary expirée.',
            ],
            'revoked' => [
                'title' => 'Délégation révoquée — :role',
                'body' => 'Votre délégation pour le rôle :role a été révoquée.',
                'sms' => 'Takussan : délégation :role révoquée.',
            ],
            'revoked_delegator' => [
                'title' => 'Délégation révoquée — :role',
                'body' => 'Vous avez révoqué la délégation de :beneficiary pour le rôle :role.',
                'sms' => 'Takussan : délégation :role de :beneficiary révoquée.',
            ],
        ],
        'bank_statement' => [
            'imported' => [
                'title' => 'Relevé importé',
                'body' => '{1} Votre relevé :bank (:lines ligne) est prêt à être rapproché.|[0,*] Votre relevé :bank (:lines lignes) est prêt à être rapproché.',
                'sms' => 'Takussan : relevé :bank importé.',
            ],
            'finalized' => [
                'title' => 'Relevé clôturé',
                'body' => 'Le relevé du :period_start au :period_end a été clôturé (:confirmed/:total lignes rapprochées).',
                'sms' => 'Takussan : relevé du :period_start au :period_end clôturé.',
            ],
        ],
        'maintenance' => [
            'created' => [
                'title' => 'Nouvelle demande de maintenance',
                'body' => 'Une demande de maintenance (:reference) a été soumise pour :property.',
                'sms' => 'Takussan : demande de maintenance :reference (:property).',
            ],
            'assigned' => [
                'title' => 'Nouvelle intervention : :request',
                'body' => 'Une intervention vous est confiée à :property. Acceptez-la ou refusez-la depuis sa fiche.',
                'sms' => 'Takussan : Nouvelle intervention : :request',
            ],
            'unassigned' => [
                'title' => 'Intervention retirée : :request',
                'body' => 'L\'intervention « :request » ne vous est plus confiée.',
                'sms' => 'Takussan : Intervention retirée : :request',
            ],
            'accepted' => [
                'title' => 'Intervention acceptée : :request',
                'body' => ':provider a accepté l\'intervention « :request ».',
                'sms' => 'Takussan : Intervention acceptée : :request',
            ],
            'declined' => [
                'title' => 'Intervention refusée : :request',
                'body' => ':provider a refusé l\'intervention « :request ». Motif : :reason',
                'sms' => 'Takussan : Intervention refusée : :request',
            ],
            'completed' => [
                'title' => 'Intervention terminée : :request',
                'body' => 'Le prestataire a terminé l\'intervention « :request ». Le demandeur doit confirmer la réparation.',
                'sms' => 'Takussan : Intervention terminée : :request',
            ],
            'confirmed' => [
                'title' => 'Réparation confirmée : :request',
                'body' => 'Le demandeur a confirmé la réparation : l\'intervention « :request » est clôturée.',
                'sms' => 'Takussan : Réparation confirmée : :request',
            ],
            'contested' => [
                'title' => 'Réparation contestée : :request',
                'body' => 'Le problème persiste sur « :request ». Commentaire : :comment',
                'sms' => 'Takussan : Réparation contestée : :request',
            ],
            'auto_closed' => [
                'title' => 'Intervention clôturée : :request',
                'body' => 'Sans réponse sous :days jours, l\'intervention « :request » a été clôturée automatiquement.',
                'sms' => 'Takussan : Intervention clôturée : :request',
            ],
            'cancelled' => [
                'title' => 'Intervention annulée : :request',
                'body' => 'L\'intervention « :request » a été annulée.',
                'sms' => 'Takussan : Intervention annulée : :request',
            ],
            'step_acknowledged' => [
                'title' => 'Votre demande « :request » : prise en compte',
                'body' => 'Votre demande d\'intervention est désormais : prise en compte.',
                'sms' => 'Takussan : Votre demande « :request » : prise en compte',
            ],
            'step_assigned' => [
                'title' => 'Votre demande « :request » : assignée',
                'body' => 'Votre demande d\'intervention est désormais : assignée.',
                'sms' => 'Takussan : Votre demande « :request » : assignée',
            ],
            'step_in_progress' => [
                'title' => 'Votre demande « :request » : en cours',
                'body' => 'Votre demande d\'intervention est désormais : en cours.',
                'sms' => 'Takussan : Votre demande « :request » : en cours',
            ],
            'step_completed' => [
                'title' => 'Votre demande « :request » : terminée',
                'body' => 'Votre demande d\'intervention est désormais : terminée.',
                'sms' => 'Takussan : Votre demande « :request » : terminée',
            ],
            'step_closed' => [
                'title' => 'Votre demande « :request » : clôturée',
                'body' => 'Votre demande d\'intervention est désormais : clôturée.',
                'sms' => 'Takussan : Votre demande « :request » : clôturée',
            ],
            'step_cancelled' => [
                'title' => 'Votre demande « :request » : annulée',
                'body' => 'Votre demande d\'intervention est désormais : annulée.',
                'sms' => 'Takussan : Votre demande « :request » : annulée',
            ],
            'step_acknowledged_scheduled' => [
                'title' => 'Votre demande « :request » : prise en compte',
                'body' => 'Votre demande d\'intervention est désormais : prise en compte. Passage prévu le :scheduled_at.',
                'sms' => 'Takussan : Votre demande « :request » : prise en compte',
            ],
            'step_assigned_scheduled' => [
                'title' => 'Votre demande « :request » : assignée',
                'body' => 'Votre demande d\'intervention est désormais : assignée. Passage prévu le :scheduled_at.',
                'sms' => 'Takussan : Votre demande « :request » : assignée',
            ],
            'step_in_progress_scheduled' => [
                'title' => 'Votre demande « :request » : en cours',
                'body' => 'Votre demande d\'intervention est désormais : en cours. Passage prévu le :scheduled_at.',
                'sms' => 'Takussan : Votre demande « :request » : en cours',
            ],
        ],
        'maintenance_quote' => [
            'requested' => [
                'title' => 'Demande de devis : :request',
                'body' => 'Un devis vous est demandé pour l\'intervention « :request ».',
                'sms' => 'Takussan : devis demandé pour « :request ».',
            ],
            'submitted' => [
                'title' => 'Devis soumis : :request',
                'body' => 'Un devis de :amount a été soumis pour l\'intervention « :request ».',
                'sms' => 'Takussan : devis de :amount soumis pour « :request ».',
            ],
            'approved' => [
                'title' => 'Devis approuvé : :request',
                'body' => 'Votre devis pour l\'intervention « :request » a été approuvé.',
                'sms' => 'Takussan : devis approuvé pour « :request ».',
            ],
            'rejected' => [
                'title' => 'Devis rejeté : :request',
                'body' => 'Votre devis pour l\'intervention « :request » a été rejeté. Motif : :reason',
                'sms' => 'Takussan : devis rejeté pour « :request ».',
            ],
            'awaiting_owner' => [
                'title' => 'Votre accord est requis : :request',
                'body' => 'Un devis de :amount pour « :request » dépasse le plafond de travaux convenu avec votre agence. Approuvez-le ou refusez-le.',
                'sms' => 'Takussan : Votre accord est requis : :request',
            ],
        ],
        'prospect_match' => [
            'digest' => [
                'title' => 'Des biens correspondent à vos prospects',
                'body' => ':properties bien(s) récent(s) ou dont le prix a changé correspondent à :prospects de vos prospects.',
                'sms' => 'Takussan : :properties bien(s) correspondent à :prospects de vos prospects.',
            ],
        ],
        'property' => [
            'approved' => [
                'title' => 'Bien approuvé : :property',
                'body' => 'Votre bien « :property » a été approuvé et est maintenant visible sur la plateforme.',
                'sms' => 'Takussan : annonce « :property » approuvée.',
            ],
            'rejected' => [
                'title' => 'Bien refusé : :property',
                'body' => 'Votre bien « :property » a été refusé. Motif : :reason. Vous pouvez corriger l\'annonce et la resoumettre depuis votre espace.',
                'sms' => 'Takussan : annonce « :property » refusée.',
            ],
            'unpublished_contact_erased' => [
                'title' => 'Annonce retirée : :property',
                'body' => 'L\'annonce :property (:reference) a été retirée du site : son seul contact a effacé son compte. Attribuez-lui un agent puis republiez-la : :url',
                'sms' => 'Takussan : l\'annonce :reference est retirée faute de contact.',
            ],
        ],
        // TCK-594 (ADR-0039) — les sorties d'argent.
        'payout' => [
            'awaiting_approval' => [
                'title' => 'Reversement :reference à approuver',
                'body' => 'Le reversement :reference de :amount attend votre approbation.',
                'sms' => 'Takussan : reversement :reference de :amount à approuver.',
            ],
            'due' => [
                'title' => 'Reversement :reference à effectuer',
                'body' => 'Le reversement :reference de :amount est arrivé à échéance : effectuez-le, puis saisissez sa référence.',
                'sms' => 'Takussan : reversement :reference à effectuer.',
            ],
            'processed' => [
                'title' => 'Reversement :reference effectué',
                'body' => 'Un reversement de :amount vous a été versé. Référence de la transaction : :transaction. Destination : :destination.',
                'sms' => 'Takussan : reversement de :amount effectué.',
            ],
            'failed' => [
                'title' => 'Reversement :reference en échec',
                'body' => 'Le reversement :reference de :amount n\'a pas abouti. Motif : :reason.',
                'sms' => 'Takussan : reversement :reference en échec.',
            ],
        ],
        'payout_method' => [
            'added' => [
                'title' => 'Destination de paiement ajoutée',
                'body' => 'La destination de paiement :destination a été ajoutée à votre compte. Si vous n\'êtes pas à l\'origine de ce changement, contactez votre agence immédiatement.',
                'sms' => 'Takussan : destination :destination ajoutée à votre compte.',
            ],
            'updated' => [
                'title' => 'Destination de paiement modifiée',
                'body' => 'La destination de paiement :destination a été modifiée sur votre compte. Si vous n\'êtes pas à l\'origine de ce changement, contactez votre agence immédiatement.',
                'sms' => 'Takussan : destination :destination modifiée sur votre compte.',
            ],
            'removed' => [
                'title' => 'Destination de paiement supprimée',
                'body' => 'La destination de paiement :destination a été supprimée de votre compte. Si vous n\'êtes pas à l\'origine de ce changement, contactez votre agence immédiatement.',
                'sms' => 'Takussan : destination :destination supprimée de votre compte.',
            ],
        ],
        'payout_threshold' => [
            'relax_requested' => [
                'title' => 'Assouplissement du seuil des reversements à confirmer',
                'body' => 'Un membre de l\'agence :agency demande d\'assouplir le seuil d\'approbation des reversements. Rien ne change tant qu\'un second approbateur ne l\'a pas confirmé depuis les réglages de l\'agence.',
                'sms' => 'Takussan : assouplissement du seuil des reversements de :agency à confirmer.',
            ],
        ],
        'owner_statement' => [
            'available' => [
                'title' => 'Relevé de gérance :period disponible',
                'body' => 'Votre relevé de gérance pour :period est disponible dans votre espace.',
                'sms' => 'Takussan : relevé de gérance :period disponible.',
            ],
        ],
        'review' => [
            'to_moderate' => [
                'title' => 'Avis à modérer : :subject',
                'body' => 'Un nouvel avis (:rating/5) sur « :subject » attend votre validation.',
                'sms' => 'Takussan : avis à modérer sur « :subject ».',
            ],
            'received' => [
                'title' => 'Nouvel avis : :subject',
                'body' => 'Un avis (:rating/5) sur « :subject » vient d\'être publié. Vous pouvez y répondre depuis votre boîte des avis.',
                'sms' => 'Takussan : nouvel avis sur « :subject ».',
            ],
        ],
        'moderation' => [
            'property_hidden' => [
                'title' => 'Annonce retirée : :property',
                'body' => 'Votre annonce « :property » a été retirée du site par la plateforme à la suite d\'un signalement. Motif : :reason_code. Seule la plateforme peut la remettre en ligne.',
                'sms' => 'Takussan : annonce « :property » retirée par la plateforme.',
            ],
            'property_removed' => [
                'title' => 'Annonce supprimée : :property',
                'body' => 'Votre annonce « :property » a été supprimée par la plateforme à la suite d\'un signalement. Motif : :reason_code.',
                'sms' => 'Takussan : annonce « :property » supprimée par la plateforme.',
            ],
            'report_upheld' => [
                'title' => 'Signalement traité : :property',
                'body' => 'Merci : l\'annonce « :property » que vous avez signalée a été retirée du site.',
                'sms' => 'Takussan : votre signalement de « :property » a été retenu.',
            ],
            'report_dismissed' => [
                'title' => 'Signalement examiné : :property',
                'body' => 'Nous avons examiné votre signalement de l\'annonce « :property » et ne l\'avons pas retenu.',
                'sms' => 'Takussan : signalement de « :property » examiné.',
            ],
        ],
    ],

    // TCK-588 — textes des classes Notification qui écrivaient leur prose en dur (français seulement).
    'threshold_alert_mail' => [
        'subject' => '[Takussan] Alerte KPI — :metric',
        'intro' => 'Une métrique surveillée a franchi son seuil.',
        'above' => ':metric : :value dépasse :threshold (sévérité : :severity).',
        'below' => ':metric : :value est inférieur à :threshold (sévérité : :severity).',
        'action' => 'Voir le tableau de bord',
        'cooldown' => '{1} Cette alerte ne sera pas renvoyée pendant :hours heure.|[0,*] Cette alerte ne sera pas renvoyée pendant :hours heures.',
    ],
    'urgent_maintenance' => [
        'subject' => 'URGENT : :title',
        'subject_escalation' => 'ESCALADE URGENTE : :title',
        'greeting' => 'Bonjour,',
        'intro' => 'Une demande de maintenance URGENTE a été soumise pour le bien.',
        'job' => 'Intervention : :title',
        'intro_escalation' => 'La demande de maintenance #:id (:title) est URGENTE et n\'a pas été traitée depuis plus de 30 minutes.',
        'cta' => 'Veuillez prendre en charge cette demande immédiatement.',
        'title' => 'Urgent : :title',
        'title_escalation' => 'Escalade urgente : :title',
    ],
    'activity_log_export' => [
        'subject' => 'Votre export du journal d\'audit est prêt',
        'greeting' => 'Bonjour,',
        'intro' => '{1} Votre export du journal d\'audit (:count entrée) est prêt.|[0,*] Votre export du journal d\'audit (:count entrées) est prêt.',
        'expires' => 'Le lien de téléchargement expire dans 24 heures.',
        'action' => 'Télécharger l\'export',
        'file' => 'Fichier : :filename',
    ],
    'report_export' => [
        'subject' => 'Votre export de rapport est prêt',
        'intro' => 'L\'export du rapport « :report » est prêt au téléchargement.',
        'action' => 'Télécharger',
        'expires' => 'Ce lien expire dans 7 jours.',
    ],

    // TCK-587 — un bailleur rattaché propose un bien à son agence (brouillon privé à relire).
    'property_proposed' => [
        'title' => 'Bien proposé par un bailleur : :title',
    ],
];
