<?php

return [
    'rules' => [
        'phone' => 'The phone number must be a valid Senegalese phone number (e.g. +221 77 123 45 67 or 771234567).',
        'currency' => 'The currency must be one of: :allowed.',
        'date_range' => 'The date must be on or after :start.',
        'strong_password' => 'The password must contain at least 8 characters, including one uppercase letter, one lowercase letter, one digit and one special character.',
    ],

    'max_guarantors_reached' => 'A lease cannot have more than 3 guarantors.',
];
