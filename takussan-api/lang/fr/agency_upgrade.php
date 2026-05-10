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
    'notifications' => [
        'submitted' => [
            'subject' => "Nouvelle demande d'upgrade d'agence : :agency",
            'body' => ':submitter (#:agency) a soumis une demande pour passer son agence en mode professionnel.',
            'action' => 'Examiner la demande',
        ],
    ],
];
