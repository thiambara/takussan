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
];
