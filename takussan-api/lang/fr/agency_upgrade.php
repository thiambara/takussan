<?php

return [
    'submit' => [
        'errors' => [
            'not_individual' => "Cette agence est déjà professionnelle : aucune demande de passage n'est nécessaire.",
            'permission_denied' => "Vous n'avez pas la permission de demander le passage de cette agence en agence professionnelle.",
            'pending_exists' => 'Une demande est déjà en cours pour cette agence (#:request_id). Révoquez-la avant d\'en soumettre une nouvelle.',
            // TCK-2669 (ADR-0104 § 5) — reprendre une demande refusée.
            'resubmit_not_allowed' => 'Seule la dernière demande refusée de cette agence peut être reprise.',
        ],
    ],
    'revoke' => [
        'errors' => [
            'not_pending' => 'Seules les demandes en attente peuvent être révoquées.',
            'permission_denied' => "Vous n'avez pas la permission de révoquer cette demande.",
        ],
    ],
    'review' => [
        'errors' => [
            'not_pending' => 'Cette demande a déjà été traitée — aucune nouvelle décision possible.',
            'permission_denied' => "Vous n'avez pas la permission de réviser cette demande.",
            'comment_required' => 'Un motif de rejet est obligatoire (5 caractères minimum).',
        ],
    ],
    'notifications' => [
        'submitted' => [
            'subject' => 'Nouvelle demande de passage en agence professionnelle : :agency',
            'body' => ':submitter (#:agency) a soumis une demande pour passer son agence en mode professionnel.',
            'action' => 'Examiner la demande',
        ],
        'approved' => [
            'subject' => 'Votre demande de passage en agence professionnelle est approuvée',
            'body' => 'Votre demande de passage en agence professionnelle est approuvée : votre agence est désormais professionnelle.',
            'action' => 'Accéder à mon espace',
        ],
        'rejected' => [
            'subject' => 'Votre demande de passage en agence professionnelle est refusée',
            'body' => 'Votre demande de passage en agence professionnelle est refusée. Motif : :comment',
            'action' => 'Soumettre une nouvelle demande',
        ],
    ],
];
