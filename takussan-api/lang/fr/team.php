<?php

return [
    'errors' => [
        'forbidden' => "Vous n'avez pas accès à la gestion d'équipe pour cette agence.",
    ],
    'invite' => [
        'errors' => [
            'individual_agency' => "Les agences individuelles n'ont pas d'équipe à gérer.",
            'permission_denied' => "Vous n'avez pas la permission de gérer l'équipe de cette agence.",
            'already_member' => 'Cet email correspond déjà à un agent de cette agence (#:profile_id).',
            'invalid_role' => "Le rôle proposé n'est pas autorisé pour cette invitation.",
        ],
    ],
    // TCK-259 — wizard onboarding agent post-acceptation
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'Le code de vérification est invalide ou expiré.',
            'not_owner' => "Vous n'avez pas accès à ce profil agent.",
        ],
    ],
];
