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
        // TCK-2191 (P191.04) — un groupe rattaché à un bail ne compte que qui lit ce bail.
        'participants_cannot_read_lease' => 'Certaines personnes choisies ne peuvent pas rejoindre ce groupe : il est rattaché à un bail, et seules les personnes qui ont accès à ce bail peuvent y participer. Pour échanger avec elles, créez un groupe sans bail rattaché.',
        'group_context_forbidden' => 'Vous ne pouvez pas rattacher ce groupe à cet élément.',
        // TCK-565, réparation 2 — la conversation directe applique le périmètre du groupe.
        'direct_single_participant' => 'Une conversation directe se tient avec une seule autre personne. Pour en réunir plusieurs, créez un groupe.',
        'conversation_context_forbidden' => 'Vous ne pouvez pas rattacher cette conversation à cet élément.',
        // TCK-576, réparation 1 — un bail et un bien visibles, mais sans rapport, se refusent.
        'lease_property_mismatch' => 'Ce bail ne concerne pas le bien choisi. Choisissez un bail de ce bien, ou retirez l’un des deux.',
        // TCK-565, passe finale — c'était une phrase française en dur dans AddParticipantsRequest.
        'participants_required' => 'Choisissez au moins une personne à ajouter.',
    ],
    // TCK-576, reprise (2026-09-24) — le nom du champ dans un 422, jamais « filter.property id ».
    'attributes' => [
        'property_filter' => 'bien',
    ],

    // TCK-592 — ADR-0038 : aperçu d'une note vocale dans la liste des conversations.
    'audio_preview' => 'Note vocale',
];
