<?php

// TCK-590 — visites : les messages d'erreur de l'API, par clé.
return [
    'agent_not_staff' => 'The chosen agent must be on the property\'s agency staff.',
    'customer_not_in_agency' => 'The chosen customer record does not belong to the property\'s agency.',
    'slot_off_grid' => 'Choose an offered slot: from 09:00 to 18:30, every 30 minutes, Dakar time.',
    'visitor_contact_required' => 'Enter the prospect\'s name and phone, or choose a customer record.',
    'sms_withheld' => 'The text message to the visitor was not sent: the sending limit for this number has been reached. Let them know another way.',
    // TCK-2502 — requests by day and time of day, the time set by the agent.
    'window_date_out_of_range' => 'Choose a day between today and the next :days days.',
    'window_started' => 'This time of day has already started today: choose a later one or another day.',
    'windows' => [
        'morning' => 'in the morning',
        'afternoon' => 'in the afternoon',
        'evening' => 'in the evening',
    ],
];
