<?php

// TCK-530 — messages App\Services\Booking\BookingQuote.
return [
    'rent_period_not_bookable' => 'Kër gii ñu ngi koy luwe ci weer walla ci at : bail la soxla, du reservation bu gàtt.',
    'dates_required' => 'Joxeel bis bu ngay dugg ak bis bu ngay génn, lu mu gëna tuuti benn guddi.',
    'amount_mismatch' => 'Xaalis bii dëppoowul ak njëgu kër gi ci bis yii.',
    'currency_mismatch' => 'Xaalis bii du xaalisu kër gi : njëgam ci xaalisam lañu ko bind.',
    'stay_too_long' => 'Dëkk bii dafa gudd lool ngir ñu ko reserve : jubbalal bis bu ngay génn.',
    'start_in_past' => 'Bisu dugg bi warul a nekk bis bu weesu.',
    'end_before_start' => 'Bisu génn bi dafa wara topp bisu dugg bi.',
    // TCK-596 — tur u liggéey bi BookingRefundTaskService di ubbi.
    'refund_task' => [
        'title' => 'Delloo bu ñu wara def — réservation :reference',
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
