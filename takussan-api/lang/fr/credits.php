<?php

// TCK-633 lot F (ADR-0061) — notifications du registre de crédits et du boost. Le nombre suit un
// deux-points : aucun accord singulier / pluriel à porter.
return [
    'notifications' => [
        'granted' => [
            'title' => 'Crédits ajoutés à votre espace',
            'body' => 'Crédits ajoutés à :agency : :credits. Ils sont valables jusqu’au :date.',
            'body_no_expiry' => 'Crédits ajoutés à :agency : :credits.',
        ],
        'expiring' => [
            'title' => 'Des crédits expirent bientôt',
            'body' => 'Crédits de :agency qui expirent le :date : :credits. Utilisez-les pour mettre vos annonces en avant.',
        ],
    ],
    'boost' => [
        'ended' => [
            'title' => 'Mise en avant terminée',
            'body' => 'La mise en avant de « :property » est terminée.',
        ],
        'refunded' => [
            'title' => 'Mise en avant remboursée',
            'body' => 'La mise en avant de « :property » a pris fin. Crédits remboursés : :credits.',
            'body_with_expired' => 'La mise en avant de « :property » a pris fin. Crédits remboursés : :credits. Crédits non remboursés, car déjà expirés : :expired.',
        ],
    ],
];
