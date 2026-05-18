<?php

return [
    'invite' => [
        'errors' => [
            'individual_agency' => 'Les agences individuelles ne peuvent pas inviter de propriétaires.',
            'permission_denied' => "Vous n'avez pas la permission d'inviter un propriétaire dans cette agence.",
            'already_member' => 'Cet email correspond déjà à un propriétaire de cette agence (#:profile_id).',
            'company_name_required' => 'La raison sociale est obligatoire pour un propriétaire de type société.',
        ],
    ],
    'onboarding' => [
        'errors' => [
            'invalid_otp' => 'Le code de vérification est invalide ou expiré.',
            'not_owner' => "Vous n'avez pas accès à ce profil propriétaire.",
        ],
    ],
];
