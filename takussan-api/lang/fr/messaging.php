<?php

return [
    'errors' => [
        'promote_admin_before_leaving' => 'Promouvoir un autre admin avant de quitter.',
        'cannot_demote_last_admin' => 'Impossible de rétrograder le dernier admin du groupe.',
        'admin_only' => 'Seul un admin peut effectuer cette action.',
        'system_message_immutable' => 'Les messages système ne peuvent être modifiés ni supprimés.',
        'group_subject_required' => 'Le sujet est obligatoire pour un groupe.',
        'group_min_participants' => 'Un groupe nécessite au moins 3 participants.',
        'group_max_participants' => 'Un groupe ne peut excéder 20 participants.',
        // TCK-565 — une phrase par cas, jamais une erreur par position du tableau.
        'participants_unavailable' => 'Une des personnes choisies n’est plus disponible. Choisissez à nouveau les participants dans la liste.',
        'participants_out_of_reach' => 'Certaines personnes choisies ne peuvent pas être ajoutées : vous ne pouvez inviter que des personnes avec qui vous êtes déjà en contact.',
        'participants_duplicate' => 'La même personne a été choisie deux fois.',
        'group_context_forbidden' => 'Vous ne pouvez pas rattacher ce groupe à cet élément.',
        // TCK-565, réparation 2 — la conversation directe applique le périmètre du groupe.
        'direct_single_participant' => 'Une conversation directe se tient avec une seule autre personne. Pour en réunir plusieurs, créez un groupe.',
        'conversation_context_forbidden' => 'Vous ne pouvez pas rattacher cette conversation à cet élément.',
        // TCK-565, passe finale — c'était une phrase française en dur dans AddParticipantsRequest.
        'participants_required' => 'Choisissez au moins une personne à ajouter.',
    ],
];
