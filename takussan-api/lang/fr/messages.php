<?php

return [
    // General
    'booking' => 'Réservation',
    'visit' => 'Visite',
    'review_reported' => 'L\'avis a été signalé avec succès.',

    // Property
    'property_cannot_publish' => 'Les biens vendus ou loués ne peuvent pas être publiés.',
    'property_cannot_unpublish' => 'Seuls les biens disponibles peuvent être dépubliés.',
    'property_parent_cycle_detected' => 'Un bien ne peut pas être placé sous lui-même ou un de ses descendants.',
    'property_parent_max_depth_exceeded' => 'La profondeur maximale de la hiérarchie est limitée à 4 niveaux.',
    'property_parent_same_agency_required' => 'Le bien parent doit appartenir à la même agence que l\'enfant.',

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
    'target_user_has_no_active_agency' => 'L’utilisateur cible n’a pas de contexte d’agence résolu. Activez un profil pour lui ou précisez l’agence cible avant d’attribuer un rôle scoping-agence.',

    // Integrations
    'integration_inactive' => 'L\'intégration est désactivée. Activez-la avant de la tester.',
    'integration_missing_credentials' => 'Aucun identifiant configuré pour cette intégration.',
    'integration_test_ok' => 'Connexion :provider vérifiée avec succès.',

    // Tags
    'tag_in_use' => 'Ce tag est encore utilisé par un ou plusieurs biens ou clients.',

    // Lease
    'lease_cannot_terminate' => 'Seuls les baux actifs ou en attente de signature peuvent être résiliés.',
    'lease_renewal_status_not_renewable' => 'Seuls les baux actifs ou expirés peuvent être renouvelés.',
    'lease_renewal_active_child_exists' => 'Ce bail a déjà un avenant actif. Résiliez-le ou attendez son expiration avant d\'en créer un nouveau.',
    'lease_renewal_max_chain_exceeded' => 'La chaîne de renouvellements ne peut pas dépasser :max niveaux.',
    'lease_renewal_field_immutable' => 'Le champ :field ne peut pas être modifié dans un avenant — créez un nouveau bail.',
    'lease_renewal_end_after_start' => 'La date de fin doit être postérieure à la date de début.',
    'lease_must_be_ended_for_refund' => 'Le bail doit être terminé ou expiré pour rembourser la caution.',
    'deposit_already_refunded' => 'La caution a déjà été intégralement remboursée pour ce bail.',
    'no_deposit_to_refund' => 'Aucun montant de caution à rembourser.',
    'refund_amount_required' => 'Le montant du remboursement est obligatoire et doit être supérieur à zéro.',
    'refund_amount_exceeds_remaining' => 'Le montant dépasse la caution restante à rembourser.',
    'refund_reason_required_for_partial' => 'Un motif est obligatoire pour un remboursement partiel.',
    'deposit_refund_payout_note' => 'Remboursement de caution — bail :reference',
    'deposit_retention_invoice_line' => 'Retenue caution — :reason',

    // Lease — early termination (TCK-090)
    'lease_early_termination_status_not_requestable' => 'Seuls les baux actifs ou expirés peuvent être résiliés par anticipation.',
    'lease_early_termination_already_in_progress' => 'Une résiliation anticipée est déjà en cours sur ce bail.',
    'lease_early_termination_notice_too_short' => 'Le préavis minimum n\'est pas respecté. La date effective doit être au plus tôt le :min.',
    'lease_early_termination_after_end_date' => 'La date effective doit être strictement antérieure à la fin contractuelle. Utilisez la fin de bail normale.',
    'lease_early_termination_not_in_progress' => 'Aucune résiliation anticipée en cours sur ce bail.',
    'lease_early_termination_window_closed' => 'La fenêtre d\'annulation est dépassée — la date effective est passée.',
    'lease_early_termination_penalty_paid' => 'Les pénalités ont déjà été réglées — la résiliation ne peut plus être annulée.',
    'lease_early_termination_penalty_unpaid' => 'Les pénalités doivent être réglées avant de finaliser la résiliation.',
    'lease_early_termination_too_early' => 'La date effective n\'est pas encore atteinte.',
    'lease_early_termination_invoice_line' => 'Pénalité de résiliation anticipée — bail :reference (effet le :effective)',

    // Lease — rent review (TCK-091)
    'lease_rent_review_status_not_reviewable' => 'Seuls les baux actifs peuvent faire l\'objet d\'une révision de loyer.',
    'lease_rent_review_reason_required' => 'Le motif est obligatoire (entre 5 et 500 caractères).',
    'lease_rent_review_invalid_amount' => 'Le nouveau loyer doit être strictement supérieur à zéro.',
    'lease_rent_review_no_baseline' => 'Le bail ne possède pas de loyer mensuel — révision impossible.',
    'lease_rent_review_variation_excessive' => 'Variation supérieure au seuil autorisé (:max %). Variation calculée : :variation %. Repassez avec force=true si vous avez la permission requise.',
    'lease_rent_review_force_not_allowed' => 'Vous n\'avez pas la permission de forcer une variation excessive (leases.rent_review_force).',
    'lease_rent_review_no_back_dating' => 'La date d\'effet ne peut pas être antérieure à aujourd\'hui.',
    'lease_rent_review_effective_date_invalid' => 'La date d\'effet est invalide.',
    'lease_rent_use_dedicated_endpoint' => 'Le loyer doit être modifié via PATCH /api/leases/{id}/rent pour garantir la traçabilité.',

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
