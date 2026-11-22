<?php

return [
    // TCK-351 (option a du porteur, 2026-11-16) — le front possède le texte affiché : `PropertyResource`
    // n'émet plus aucun `*_label`, et les groupes `rent_period`, `status`, `title_type` et `condition`,
    // qui n'avaient pas d'autre lecteur, sont retirés. `type` et `contract_type` restent pour leurs
    // seuls lecteurs serveur — vocabulaire de recherche (alias, suggestions, `SearchWolofReviewSheet`)
    // et titre du radar —, jamais pour un écran du front, qui rend ces codes par next-intl.
    'type' => [
        'land' => 'Land',
        'house' => 'House',
        'apartment' => 'Apartment',
        'villa' => 'Villa',
        'studio' => 'Studio',
        'room' => 'Room',
        'office' => 'Office',
        'shop' => 'Shop',
        'warehouse' => 'Warehouse',
        'factory' => 'Factory',
        'farm' => 'Farm',
        'hotel' => 'Hotel',
        'resort' => 'Resort',
        'garage' => 'Garage',
        'parking' => 'Parking',
        'other' => 'Other',
    ],
    'contract_type' => [
        'sale' => 'For Sale',
        'rent' => 'For Rent',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'photos_required' => 'Select at least one photo.',
        'photo_image' => 'The file must be a readable image.',
        'photo_mimes' => 'Accepted formats: JPG, PNG or WebP.',
        'photo_max' => 'Each photo must weigh 10 MB or less.',
    ],
];
