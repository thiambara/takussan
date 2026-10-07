<?php

/*
 * TCK-591 — textes du CRM de l'agent (tâches, clients, rapprochement). Fichier propre au ticket :
 * `errors.php` est créé par TCK-587 et TCK-588 en parallèle (brief de la vague 73, lot B).
 */

return [
    'customers' => [
        'duplicate' => 'Un client de votre agence porte déjà ce numéro ou cette adresse e-mail.',
        'primary_contact_not_staff' => "Le référent doit être un agent ou un administrateur de l'agence du client.",
    ],
    'tasks' => [
        'assignee_not_staff' => "L'assigné doit être vous-même ou un membre du personnel de l'agence.",
    ],
    'match_digest' => [
        'title' => 'Des biens correspondent à vos prospects',
        'body' => ':properties bien(s) récent(s) ou dont le prix a changé correspondent à :prospects de vos prospects.',
    ],
];
