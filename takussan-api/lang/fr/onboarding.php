<?php

return [
    'host_individual' => [
        'errors' => [
            'invalid_otp' => 'Le code de vérification est invalide ou expiré.',
            'cgu_required' => "Vous devez accepter les conditions d'utilisation pour continuer.",
            'already_onboarded' => 'Vous possédez déjà une agence personnelle.',
            'phone_mismatch' => 'Ce numéro n’est pas celui de votre compte : renvoyez le code à ce numéro.',
        ],
    ],
    // TCK-633 (lot C) — le nom de l'espace créé sans question (« Publier »).
    'auto_space' => [
        'name_with_first_name' => 'Espace de :first_name',
        'name_default' => 'Mon espace',
    ],
];
