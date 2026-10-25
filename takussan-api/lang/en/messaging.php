<?php

return [
    'errors' => [
        'promote_admin_before_leaving' => 'Promote another admin before leaving.',
        'cannot_demote_last_admin' => 'Cannot demote the last admin of the group.',
        'admin_only' => 'Only an admin can perform this action.',
        'system_message_immutable' => 'System messages cannot be edited or deleted.',
        'group_subject_required' => 'A subject is required for a group.',
        'group_min_participants' => 'A group requires at least 3 participants.',
        'group_max_participants' => 'A group cannot have more than 20 participants.',
        // TCK-565 — une phrase par cas, jamais une erreur par position du tableau.
        'participants_unavailable' => 'One of the selected people is no longer available. Choose the participants again from the list.',
        'participants_out_of_reach' => 'Some of the selected people cannot be added: you can only invite people you are already in touch with.',
        'participants_duplicate' => 'The same person was selected twice.',
        // TCK-2191 (P191.04) — un groupe rattaché à un bail ne compte que qui lit ce bail.
        'participants_cannot_read_lease' => 'Some of the selected people cannot join this group: it is linked to a lease, and only people who have access to that lease can take part. To talk with them, create a group without a linked lease.',
        'group_context_forbidden' => 'You cannot link this group to this item.',
        // TCK-565, réparation 2 — la conversation directe applique le périmètre du groupe.
        'direct_single_participant' => 'A direct conversation is with exactly one other person. To bring several people together, create a group.',
        'conversation_context_forbidden' => 'You cannot link this conversation to this item.',
        // TCK-576, réparation 1 — un bail et un bien visibles, mais sans rapport, se refusent.
        'lease_property_mismatch' => 'This lease is not for the selected property. Choose a lease of this property, or remove one of the two.',
        // TCK-565, passe finale — c'était une phrase française en dur dans AddParticipantsRequest.
        'participants_required' => 'Choose at least one person to add.',
    ],
    // TCK-576, reprise (2026-09-24) — le nom du champ dans un 422, jamais « filter.property id ».
    'attributes' => [
        'property_filter' => 'property',
    ],

    // TCK-592 — ADR-0038 : aperçu d'une note vocale dans la liste des conversations.
    'audio_preview' => 'Voice note',
];
