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

            // TCK-272 — voie de step-up alternative (code e-mail).
            'password_not_applicable' => "Ce compte n'a pas de mot de passe : confirmez avec le code reçu par e-mail.",
            'step_up_not_applicable' => 'Ce compte a un mot de passe : confirmez avec votre mot de passe.',
            'step_up_code_required' => 'Code de confirmation requis.',
            'step_up_code_invalid' => 'Code de confirmation invalide ou expiré.',
        ],
        // TCK-272 — le message est volontairement invariant : il ne dit
        // jamais si un code a effectivement été émis.
        'step_up' => [
            'code_sent' => "Si ce compte peut recevoir un code, il vient d'être envoyé à votre adresse e-mail.",
        ],

        'obligations' => [
            'lease_active' => 'Bail actif :reference à terminer.',
            'payment_pending' => 'Paiement en attente :reference.',
            'invoice_pending' => 'Facture en attente :reference.',
            'booking_open' => 'Réservation en cours :reference.',
        ],
    ],

];
