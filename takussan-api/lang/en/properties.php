<?php

return [
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
    'rent_period' => [
        'daily' => 'per day',
        'weekly' => 'per week',
        'monthly' => 'per month',
        'yearly' => 'per year',
    ],
    'status' => [
        'available' => 'Available',
        'sold' => 'Sold',
        'rented' => 'Rented',
        'under_maintenance' => 'Under Maintenance',
        'unavailable' => 'Unavailable',
        'pending' => 'Pending',
        'draft' => 'Draft',
        'published' => 'Published',
        'archived' => 'Archived',
    ],
    'title_type' => [
        'bail' => 'Lease',
        'titre_foncier' => 'Land Title',
        'deliberation' => 'Deliberation',
        'autre' => 'Other',
    ],
    'condition' => [
        'off_plan' => 'Off-plan',
        'new' => 'New build',
        'renovated' => 'Renovated',
        'good' => 'Good condition',
        'to_renovate' => 'Needs renovation',
    ],
    // TCK-656 — messages de validation, rendus dans la langue de la requête.
    'validation' => [
        'photos_required' => 'Select at least one photo.',
        'photo_image' => 'The file must be a readable image.',
        'photo_mimes' => 'Accepted formats: JPG, PNG or WebP.',
        'photo_max' => 'Each photo must weigh 10 MB or less.',
    ],
];
