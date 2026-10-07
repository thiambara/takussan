<?php

/*
 * TCK-591 — textes du CRM de l'agent (tâches, clients, rapprochement). Fichier propre au ticket :
 * `errors.php` est créé par TCK-587 et TCK-588 en parallèle (brief de la vague 73, lot B).
 */

return [
    'customers' => [
        'duplicate' => 'A customer of your agency already has this phone number or email address.',
        'primary_contact_not_staff' => "The account manager must be an agent or an administrator of the customer's agency.",
    ],
    'tasks' => [
        'assignee_not_staff' => 'The assignee must be yourself or a staff member of the agency.',
    ],
    'match_digest' => [
        'title' => 'Properties match your prospects',
        'body' => ':properties new or repriced property(ies) match :prospects of your prospects.',
    ],
];
