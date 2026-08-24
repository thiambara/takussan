<?php

return [
    // Core Laravel validation messages (subset).
    'required' => 'The :attribute field is required.',
    'email' => 'The :attribute must be a valid email address.',
    'min' => [
        'string' => 'The :attribute must be at least :min characters.',
        'numeric' => 'The :attribute must be at least :min.',
    ],
    'max' => [
        'string' => 'The :attribute may not be greater than :max characters.',
        'numeric' => 'The :attribute may not be greater than :max.',
    ],
    'unique' => 'The :attribute has already been taken.',
    'exists' => 'The selected :attribute is invalid.',

    'rules' => [
        'phone' => 'The phone number must be a valid Senegalese phone number (e.g. +221 77 123 45 67 or 771234567).',
        'currency' => 'The currency must be one of: :allowed.',
        'date_range' => 'The date must be on or after :start.',
        'strong_password' => 'The password must contain at least 8 characters, including one uppercase letter, one lowercase letter, one digit and one special character.',
    ],
    'max_guarantors_reached' => 'A lease cannot have more than 3 guarantors.',
    'bounds_format' => 'The :attribute must be four comma-separated numbers: sw_lat,sw_lng,ne_lat,ne_lng.',
    'geo_radius_requires_point' => 'The :attribute field requires a complete point: both lat and lng must be provided.',
    'sort_distance_requires_point' => 'Sorting by distance requires a complete point: both lat and lng must be provided.',
    'commission_share_exceeds_cap' => 'The sum of commission shares for this property cannot exceed 100%.',
];
