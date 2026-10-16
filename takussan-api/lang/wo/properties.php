<?php

return [
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
    'rent_period' => [
        'daily' => 'ci bés',
        'weekly' => 'ci ayu',
        'monthly' => 'ci weer',
        'yearly' => 'ci at',
    ],
    'status' => [
        'available' => 'Am na',
        'sold' => 'Jënde na',
        'rented' => 'Tëddé na',
        'under_maintenance' => 'Repal',
        'unavailable' => 'Amul',
        'pending' => 'Attente',
        'draft' => 'Brouillon',
        'published' => 'Publié',
        'archived' => 'Archivé',
    ],
    'title_type' => [
        'bail' => 'Contrat',
        'titre_foncier' => 'Titre foncier',
        'deliberation' => 'Délibération',
        'autre' => 'Yeneen',
    ],
    // TCK-508 — en français, comme « Titre foncier » ci-dessus, en attendant la
    // validation d'un locuteur wolophone : un faux ami affiché sur une annonce
    // (« land » => « Dëkk », village) coûte plus qu'un mot français compris.
    'condition' => [
        'off_plan' => 'Sur plan',
        'new' => 'Neuf',
        'renovated' => 'Rénové',
        'good' => 'Bon état',
        'to_renovate' => 'À rénover',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'photos_required' => 'Tànnal benn nataal lu mu néew.',
        'photo_image' => 'Fisiye bi war na doon nataal bu ñu mën a jàng.',
        'photo_mimes' => 'Formaa yi ñu nangu : JPG, PNG walla WebP.',
        'photo_max' => 'Benn nataal du wara ëpp 10 Mo.',
    ],
];
