<?php

/*
 * TCK-592 — textes du domaine maintenance. Depuis TCK-588, une notification est un code
 * (`notifications.php` → `codes.maintenance*`) et un refus un code d'erreur (`errors.php` →
 * `maintenance.*`) ; restent ici les libellés de statut, les refus de validation, les messages
 * système du fil et le devis PDF.
 */
return [
    'status' => [
        'open' => 'ouverte',
        'acknowledged' => 'prise en compte',
        'quote_requested' => 'devis demandé',
        'quote_submitted' => 'devis soumis',
        'awaiting_owner' => 'en attente du bailleur',
        'approved' => 'devis approuvé',
        'rejected' => 'devis refusé',
        'assigned' => 'assignée',
        'in_progress' => 'en cours',
        'completed' => 'terminée',
        'closed' => 'clôturée',
        'cancelled' => 'annulée',
    ],

    'errors' => [
        'not_assignable' => 'Ce compte ne peut pas recevoir l\'intervention : il faut un prestataire actif en collaboration active avec l\'agence du bien, ou un membre de son équipe.',
        'invitation_request_invalid' => 'La demande d\'intervention liée doit appartenir à cette agence et ne pas être clôturée ni annulée.',
    ],

    'system' => [
        'assigned' => 'Intervention confiée à :provider.',
        'unassigned' => 'L\'intervention n\'est plus confiée à :provider.',
        'accepted' => ':provider a accepté l\'intervention.',
        'declined' => ':provider a refusé l\'intervention.',
        'status' => 'Statut : :status.',
    ],

    'quote_pdf' => [
        'title' => 'Devis d\'intervention',
        'request' => 'Intervention',
        'property' => 'Bien',
        'provider' => 'Prestataire',
        'submitted_at' => 'Soumis le',
        'valid_until' => 'Valable jusqu\'au',
        'duration' => 'Durée estimée',
        'duration_days' => ':days jour(s)',
        'label' => 'Désignation',
        'kind' => 'Nature',
        'quantity' => 'Quantité',
        'unit_price' => 'Prix unitaire',
        'line_total' => 'Total',
        'total' => 'Total du devis',
        'kinds' => [
            'labour' => 'Main-d\'œuvre',
            'supply' => 'Fourniture',
        ],
    ],
];
