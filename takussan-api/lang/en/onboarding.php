<?php

return [
    'host_individual' => [
        'errors' => [
            'invalid_otp' => 'The verification code is invalid or has expired.',
            'cgu_required' => 'You must accept the terms of service to continue.',
            'already_onboarded' => 'You already own a personal agency.',
        ],
    ],
    // TCK-633 (lot C) — le nom de l'espace créé sans question (« Publier »).
    'auto_space' => [
        'name_with_first_name' => 'Space of :first_name',
        'name_default' => 'My space',
    ],
];
