<?php

return [
    'invite' => [
        'errors' => [
            'agency_kind' => 'Cette agence ne peut pas inviter de prestataire.',
            'permission_denied' => "Vous n'avez pas la permission d'inviter un prestataire dans cette agence.",
            'already_member' => 'Cet email correspond déjà à un prestataire actif de cette agence (#:profile_id).',
        ],
    ],
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'Le code de vérification est invalide ou expiré.',
            'not_owner' => 'Vous ne pouvez pas modifier ce profil prestataire.',
        ],
    ],
];
