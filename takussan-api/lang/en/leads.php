<?php

// TCK-590 — demandes de contact : les messages d'erreur de l'API, par clé.
return [
    'contact_unavailable' => 'This property has no reachable contact at the moment. Your request was not sent.',
    'already_converted' => 'This request has already been converted into a customer record.',
    'assignee_not_staff' => 'The request can only be assigned to staff of its agency.',
    'not_convertible' => 'Only a request sent through the form can become a customer record.',
    'without_agency' => 'This request is not linked to any agency: it cannot become a customer record.',
    'phone_country_code' => 'This number\'s country code is incomplete: write +221 77 123 45 67, or simply 77 123 45 67.',
];
