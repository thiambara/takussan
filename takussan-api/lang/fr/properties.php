<?php

return [
    // TCK-351 (option a du porteur, 2026-11-16) — le front possède le texte affiché : `PropertyResource`
    // n'émet plus aucun `*_label`, et les groupes `rent_period`, `status`, `title_type` et `condition`,
    // qui n'avaient pas d'autre lecteur, sont retirés. `type` et `contract_type` restent pour leurs
    // seuls lecteurs serveur — vocabulaire de recherche (alias, suggestions, `SearchWolofReviewSheet`)
    // et titre du radar —, jamais pour un écran du front, qui rend ces codes par next-intl.
    'type' => [
        'land' => 'Terrain',
        'house' => 'Maison',
        'apartment' => 'Appartement',
        'villa' => 'Villa',
        'studio' => 'Studio',
        'room' => 'Chambre',
        'office' => 'Bureau',
        'shop' => 'Commerce',
        'warehouse' => 'Entrepôt',
        'factory' => 'Usine',
        'farm' => 'Ferme',
        'hotel' => 'Hôtel',
        'resort' => 'Complexe',
        'garage' => 'Garage',
        'parking' => 'Parking',
        'other' => 'Autre',
    ],
    'contract_type' => [
        'sale' => 'À vendre',
        'rent' => 'À louer',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'photos_required' => 'Sélectionnez au moins une photo.',
        'photo_image' => 'Le fichier doit être une image lisible.',
        'photo_mimes' => 'Formats acceptés : JPG, PNG ou WebP.',
        'photo_max' => 'Chaque photo doit peser 10 Mo maximum.',
    ],
];
