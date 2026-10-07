<?php

/*
 * TCK-592 — textes du domaine maintenance. L'API n'écrit aucun littéral : chaque notification et
 * chaque refus passe par une clé de ce fichier, rendue dans la langue du DESTINATAIRE.
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
        'transition_not_allowed' => 'Le passage de « :from » à « :to » n\'est pas permis.',
        'dedicated_endpoint' => 'Ce changement de statut passe par son propre geste, pas par le statut générique.',
        'not_assignable' => 'Ce compte ne peut pas recevoir l\'intervention : il faut un prestataire actif en collaboration active avec l\'agence du bien, ou un membre de son équipe.',
        'decline_after_accept' => 'L\'intervention a déjà été acceptée ou démarrée : elle ne se refuse plus.',
        'already_accepted' => 'L\'intervention est déjà acceptée.',
        'terminal_request' => 'Une demande clôturée ou annulée ne reçoit plus de pièces.',
        'cost_ambiguous' => 'Indiquez soit « cost », soit « actual_cost », pas les deux.',
        'actual_cost_needs_owner' => 'Ce coût dépasse le plafond de travaux du bailleur et ce qu\'il a approuvé : seul le bailleur peut l\'inscrire.',
        'before_photos_requires_acceptance' => 'Les photos « avant » sont réservées au prestataire qui a accepté l\'intervention.',
        'quote_expired' => 'Ce devis n\'est plus valable : sa date de validité est passée.',
        'invitation_request_invalid' => 'La demande d\'intervention liée doit appartenir à cette agence et ne pas être clôturée ni annulée.',
        'collaboration_transition' => 'Ce changement de statut de collaboration n\'est pas permis.',
    ],

    'notifications' => [
        'created' => [
            'title' => 'Nouvelle demande d\'intervention',
            'body' => 'Une demande d\'intervention a été soumise pour :property : « :title ».',
        ],
        'assigned' => [
            'title' => 'Nouvelle intervention : :title',
            'body' => 'Une intervention vous est confiée à :property. Acceptez-la ou refusez-la depuis sa fiche.',
        ],
        'unassigned' => [
            'title' => 'Intervention retirée : :title',
            'body' => 'L\'intervention « :title » ne vous est plus confiée.',
        ],
        'accepted' => [
            'title' => 'Intervention acceptée : :title',
            'body' => ':provider a accepté l\'intervention « :title ».',
        ],
        'declined' => [
            'title' => 'Intervention refusée : :title',
            'body' => ':provider a refusé l\'intervention « :title ». Motif : :reason',
        ],
        'quote_requested' => [
            'title' => 'Devis demandé : :title',
            'body' => 'Un devis vous est demandé pour l\'intervention « :title ».',
        ],
        'quote_submitted' => [
            'title' => 'Devis soumis : :title',
            'body' => 'Un devis de :amount a été soumis pour l\'intervention « :title ».',
        ],
        'quote_awaiting_owner' => [
            'title' => 'Votre accord est requis : :title',
            'body' => 'Un devis de :amount pour « :title » dépasse le plafond de travaux convenu avec votre agence. Approuvez-le ou refusez-le.',
        ],
        'quote_approved' => [
            'title' => 'Devis approuvé : :title',
            'body' => 'Votre devis pour l\'intervention « :title » a été approuvé.',
        ],
        'quote_rejected' => [
            'title' => 'Devis refusé : :title',
            'body' => 'Votre devis pour l\'intervention « :title » a été refusé. Motif : :reason',
        ],
        'completed' => [
            'title' => 'Intervention terminée : :title',
            'body' => 'Le prestataire a terminé l\'intervention « :title ». Le demandeur doit confirmer la réparation.',
        ],
        'confirmed' => [
            'title' => 'Réparation confirmée : :title',
            'body' => 'Le demandeur a confirmé la réparation : l\'intervention « :title » est clôturée.',
        ],
        'contested' => [
            'title' => 'Réparation contestée : :title',
            'body' => 'Le problème persiste sur « :title ». Commentaire : :comment',
        ],
        'auto_closed' => [
            'title' => 'Intervention clôturée : :title',
            'body' => 'Sans réponse sous :days jours, l\'intervention « :title » a été clôturée automatiquement.',
        ],
        'cancelled' => [
            'title' => 'Intervention annulée : :title',
            'body' => 'L\'intervention « :title » a été annulée.',
        ],
        'step' => [
            'title' => 'Votre demande « :title » : :status',
            'body' => 'Votre demande d\'intervention est désormais : :status.',
            'body_scheduled' => 'Votre demande d\'intervention est désormais : :status. Passage prévu le :date.',
        ],
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
