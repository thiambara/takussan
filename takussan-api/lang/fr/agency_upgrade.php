<?php

return [
    'submit' => [
        'errors' => [
            'not_individual' => "Cette agence est déjà professionnelle — aucune demande d'upgrade nécessaire.",
            'permission_denied' => "Vous n'avez pas la permission de soumettre une demande d'upgrade pour cette agence.",
            'pending_exists' => 'Une demande est déjà en cours pour cette agence (#:request_id). Révoquez-la avant d\'en soumettre une nouvelle.',
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
            'subject' => "Nouvelle demande d'upgrade d'agence : :agency",
            'body' => ':submitter (#:agency) a soumis une demande pour passer son agence en mode professionnel.',
            'action' => 'Examiner la demande',
        ],
        'approved' => [
            'subject' => "Votre demande d'upgrade a été approuvée",
            'body' => "Votre demande d'upgrade a été approuvée. Votre agence est désormais en mode professionnel.",
            'action' => 'Accéder à mon espace',
        ],
        'rejected' => [
            'subject' => "Votre demande d'upgrade a été rejetée",
            'body' => "Votre demande d'upgrade a été rejetée. Motif : :comment",
            'action' => 'Soumettre une nouvelle demande',
        ],
    ],
];
