<?php

// TCK-530 — messages de App\Services\Booking\BookingQuote.
return [
    'rent_period_not_bookable' => 'Ce bien se loue au mois ou à l\'année : il relève d\'un bail, pas d\'une réservation courte durée.',
    'dates_required' => 'Indiquez des dates d\'arrivée et de départ couvrant au moins une nuit.',
    'amount_mismatch' => 'Ce montant ne correspond pas au prix du bien pour ces dates.',
    'currency_mismatch' => 'Cette devise n\'est pas celle du bien : ses prix sont exprimés dans sa propre devise.',
    'stay_too_long' => 'Ce séjour est trop long pour être réservé : rapprochez la date de départ.',
    'start_in_past' => 'La date d\'arrivée ne peut pas être passée.',
    'end_before_start' => 'La date de départ doit suivre la date d\'arrivée.',
    // TCK-596 — titre de la tâche ouverte par BookingRefundTaskService.
    'refund_task' => [
        'title' => 'Remboursement à traiter — réservation :reference',
    ],
    // TCK-2872 (ADR-0110 § 2) — les pièces du dossier, pour le texte d'une notification.
    'dossier_pieces' => [
        'identity' => 'pièce d\'identité',
        'payslips' => 'bulletins de salaire',
        'employment_certificate' => 'attestation de travail',
        'guarantor_commitment' => 'engagement du garant',
        'guarantor_identity' => 'pièce d\'identité du garant',
        'proof_of_funds' => 'justificatif de fonds',
        'other' => 'autre pièce',
    ],
    // TCK-2873 (ADR-0110 § 5) — la réponse du client à une contre-offre, rendue dans une notification à l'agence.
    'counter_offer_answers' => [
        'accepted' => 'accepté',
        'declined' => 'décliné',
    ],
];
