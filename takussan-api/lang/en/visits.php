<?php

// TCK-590 — visites : les messages d'erreur de l'API, par clé.
return [
    'agent_not_staff' => 'The chosen agent must be on the property\'s agency staff.',
    'customer_not_in_agency' => 'The chosen customer record does not belong to the property\'s agency.',
    'slot_off_grid' => 'Choose an offered slot: from 09:00 to 18:30, every 30 minutes, Dakar time.',
    'reschedule_inactive' => 'Only a pending or confirmed visit can change slot.',
    'already_assigned' => 'This visit is already handled by another member of the agency.',
    'reassign_forbidden' => 'Changing the agent of an already assigned visit requires the assign right.',
    'visitor_contact_required' => 'Enter the prospect\'s name and phone, or choose a customer record.',
    'not_bookable' => 'This property is not open for visits.',
    'staff_only' => 'Only the staff of the property\'s agency can cancel or move this visit.',
];
