<?php

/**
 * TCK-080 — RGPD account deletion strings (FR).
 */
return [

    'deletion' => [
        'errors' => [
            'invalid_request' => 'Demande de suppression invalide.',
            'password_invalid' => 'Mot de passe incorrect.',
            'two_factor_required' => 'Code à deux facteurs requis ou invalide.',
            'has_obligations' => 'Vous avez des obligations en cours qui empêchent la suppression.',
            'no_pending_request' => 'Aucune demande de suppression en cours.',
            'already_executed' => 'La suppression a déjà été exécutée.',
            'grace_expired' => "Le délai d'annulation a expiré.",
        ],
        'obligations' => [
            'lease_active' => 'Bail actif :reference à terminer.',
            'payment_pending' => 'Paiement en attente :reference.',
            'invoice_pending' => 'Facture en attente :reference.',
            'booking_open' => 'Réservation en cours :reference.',
        ],
    ],

];
