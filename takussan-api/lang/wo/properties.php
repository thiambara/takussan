<?php

return [
    // TCK-351 (option a du porteur, 2026-11-16) — le front possède le texte affiché : `PropertyResource`
    // n'émet plus aucun `*_label`, et les groupes `rent_period`, `status`, `title_type` et `condition`,
    // qui n'avaient pas d'autre lecteur, sont retirés. `type` et `contract_type` restent pour leurs
    // seuls lecteurs serveur — vocabulaire de recherche (alias, suggestions, `SearchWolofReviewSheet`)
    // et titre du radar —, jamais pour un écran du front, qui rend ces codes par next-intl.
    'type' => [
        'land' => 'Dëkk',
        'house' => 'Kër',
        'apartment' => 'Appart',
        'villa' => 'Villa',
        'studio' => 'Studio',
        'room' => 'Néeg',
        'office' => 'Birow',
        'shop' => 'Boutik',
        'warehouse' => 'Dépôt',
        'factory' => 'Usine',
        'farm' => 'Jën',
        'hotel' => 'Hôtel',
        'resort' => 'Complexe',
        'garage' => 'Garaj',
        'parking' => 'Parking',
        'other' => 'Yeneen',
    ],
    'contract_type' => [
        'sale' => 'Jënd',
        'rent' => 'Tëddé',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'photos_required' => 'Tànnal benn nataal lu mu néew.',
        'photo_image' => 'Fisiye bi war na doon nataal bu ñu mën a jàng.',
        'photo_mimes' => 'Formaa yi ñu nangu : JPG, PNG walla WebP.',
        'photo_max' => 'Benn nataal du wara ëpp 10 Mo.',
    ],
];
