<?php

return [
    // General
    'booking' => 'Réservation',
    'visit' => 'Visite',
    'review_reported' => 'L\'avis a été signalé avec succès.',

    // Property
    'property_cannot_publish' => 'Les biens vendus ou loués ne peuvent pas être publiés.',
    'property_cannot_unpublish' => 'Seuls les biens disponibles peuvent être dépubliés.',

    // User / Agency
    'user_already_in_agency' => 'Cet utilisateur appartient déjà à une autre agence.',
    'user_not_in_agency' => 'Cet utilisateur ne fait pas partie de cette agence.',
    'cannot_remove_primary_admin' => 'Impossible de retirer l\'administrateur principal de l\'agence.',
    'cannot_remove_last_agency_admin' => 'Impossible de retirer le dernier administrateur de l\'agence.',
    'user_not_found_by_email' => 'Aucun utilisateur actif n\'a été trouvé pour cet email.',
    'cannot_block_self' => 'Vous ne pouvez pas bloquer votre propre compte.',
    'cannot_delete_self' => 'Vous ne pouvez pas supprimer votre propre compte via cette route.',
    'collaborator_already_exists' => 'Ce collaborateur est déjà ajouté à ce bien.',
    'only_super_admin_can_grant_super_admin' => 'Seul un super administrateur peut attribuer le rôle super_admin.',

    // Integrations
    'integration_inactive' => 'L\'intégration est désactivée. Activez-la avant de la tester.',
    'integration_missing_credentials' => 'Aucun identifiant configuré pour cette intégration.',
    'integration_test_ok' => 'Connexion :provider vérifiée avec succès.',

    // Tags
    'tag_in_use' => 'Ce tag est encore utilisé par un ou plusieurs biens ou clients.',

    // Lease
    'lease_cannot_terminate' => 'Seuls les baux actifs ou en attente de signature peuvent être résiliés.',
    'lease_must_be_ended_for_refund' => 'Le bail doit être terminé ou expiré pour rembourser la caution.',
    'deposit_already_refunded' => 'La caution a déjà été remboursée pour ce bail.',
    'no_deposit_to_refund' => 'Aucun montant de caution à rembourser.',

    // Notifications
    'new_maintenance_title' => 'Nouvelle demande de maintenance',
    'new_maintenance_body' => 'Une demande de maintenance a été soumise pour :property.',
    'payment_reminder_title' => 'Rappel de paiement',
    'payment_reminder_body' => 'Votre loyer pour :property est dû le :date.',
    'late_payment_title' => 'Paiement en retard',
    'late_payment_body' => 'Votre paiement pour :property est en retard depuis le :date.',
    'visit_reminder_title' => 'Rappel de visite',
    'visit_reminder_body' => 'Vous avez une visite prévue demain pour :property.',
    'overdue_invoice_title' => 'Facture en retard',
    'overdue_invoice_body' => 'La facture #:reference est en retard de paiement.',
    'booking_confirmed_title' => 'Réservation confirmée',
    'booking_confirmed_body' => 'Votre réservation pour :property a été confirmée.',
    'lease_activated_title' => 'Bail activé',
    'lease_activated_body' => 'Votre bail pour :property est maintenant actif.',
    'new_message_title' => 'Nouveau message',
    'new_message_body' => ':sender vous a envoyé un message.',
];
