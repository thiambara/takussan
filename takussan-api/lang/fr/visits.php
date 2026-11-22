<?php

// TCK-590 — visites : les messages d'erreur de l'API, par clé.
return [
    'agent_not_staff' => 'L\'agent choisi doit faire partie du personnel de l\'agence du bien.',
    'customer_not_in_agency' => 'La fiche client choisie n\'appartient pas à l\'agence du bien.',
    'slot_off_grid' => 'Choisissez un créneau proposé : de 09:00 à 18:30, toutes les 30 minutes, heure de Dakar.',
    'visitor_contact_required' => 'Indiquez le nom et le téléphone du prospect, ou choisissez une fiche client.',
    'sms_withheld' => 'Le SMS au visiteur n\'est pas parti : la limite d\'envoi vers ce numéro est atteinte. Prévenez-le par un autre moyen.',
    // TCK-2502 — la demande par jour et tranche, l'heure fixée par l'agent.
    'window_date_out_of_range' => 'Choisissez un jour entre aujourd\'hui et les :days prochains jours.',
    'window_started' => 'Cette tranche a déjà commencé aujourd\'hui : choisissez une tranche plus tardive ou un autre jour.',
    'windows' => [
        'morning' => 'le matin',
        'afternoon' => 'l\'après-midi',
        'evening' => 'en soirée',
    ],
];
