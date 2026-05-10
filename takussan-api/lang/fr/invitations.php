<?php

return [
    'roles' => [
        'owner' => 'propriétaire',
        'agent' => 'agent',
        'agency_admin' => 'administrateur d\'agence',
        'service_provider' => 'prestataire de services',
        'super_admin' => 'super administrateur',
    ],
    'errors' => [
        'duplicate_pending' => 'Une invitation est déjà en attente pour cet email (#:id).',
        'requires_login' => 'Cet email correspond à un compte existant. Veuillez vous connecter pour accepter l\'invitation.',
        'email_mismatch' => 'L\'email du compte connecté ne correspond pas à celui de l\'invitation.',
        'token_not_found' => 'Cette invitation est introuvable.',
        'token_expired' => 'Cette invitation a expiré.',
        'token_accepted' => 'Cette invitation a déjà été acceptée.',
        'token_revoked' => 'Cette invitation a été révoquée.',
        'token_sent' => 'Cette invitation est encore en attente d\'acceptation.',
        'cannot_create' => 'Vous n\'avez pas la permission d\'envoyer une invitation.',
        'cannot_view' => 'Vous n\'avez pas la permission de consulter cette invitation.',
        'cannot_revoke' => 'Vous n\'avez pas la permission de révoquer cette invitation.',
        'cannot_resend' => 'Cette invitation ne peut plus être renvoyée.',
        'already_accepted' => 'Cette invitation a déjà été acceptée et ne peut être révoquée.',
        'invalid_role' => 'Le rôle demandé n\'est pas autorisé pour les invitations.',
        'cross_agency' => 'Vous ne pouvez pas inviter une personne dans une autre agence.',
    ],
];
