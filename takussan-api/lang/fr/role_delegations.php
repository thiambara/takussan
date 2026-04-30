<?php

return [
    'notifications' => [
        'activated' => [
            'title' => 'Rôle délégué — :role',
            'body_beneficiary' => 'Vous avez reçu le rôle :role jusqu\'au :ends_at.',
            'body_delegator' => 'La délégation à :beneficiary pour le rôle :role est maintenant active.',
        ],
        'expired' => [
            'title' => 'Délégation expirée — :role',
            'body_beneficiary' => 'Votre délégation pour le rôle :role a pris fin.',
            'body_delegator' => 'La délégation à :beneficiary pour le rôle :role a expiré.',
        ],
        'revoked' => [
            'title' => 'Délégation révoquée — :role',
            'body_beneficiary' => 'Votre délégation pour le rôle :role a été révoquée.',
            'body_delegator' => 'Vous avez révoqué la délégation de :beneficiary pour le rôle :role.',
        ],
    ],
    'validation' => [
        'self_delegation' => 'Vous ne pouvez pas vous déléguer un rôle.',
        'non_delegable_role' => 'Ce rôle ne peut pas être délégué.',
        'max_duration' => 'La durée maximale est de :max jours.',
        'user_not_in_agency' => 'L\'utilisateur n\'appartient pas à cette agence.',
        'already_primary_admin' => 'Cet utilisateur est déjà administrateur principal de l\'agence.',
    ],
];
