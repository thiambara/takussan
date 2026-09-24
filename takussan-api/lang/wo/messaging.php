<?php

return [
    'errors' => [
        'promote_admin_before_leaving' => 'Tabbal beneen admin laata nga génn.',
        'cannot_demote_last_admin' => 'Mënu nga summi admin bu mujj bi.',
        'admin_only' => 'Admin rekk moo mën def lii.',
        'system_message_immutable' => 'Wax ci sistem mënul soppi walla far.',
        'group_subject_required' => 'Sujet bi laaj na ci kuréel bi.',
        'group_min_participants' => 'Kuréel daa laaj 3 nit yu nekk ci biir.',
        'group_max_participants' => 'Kuréel mënul yokku ndax 20 nit.',
        // TCK-565 — une phrase par cas, jamais une erreur par position du tableau.
        'participants_unavailable' => 'Kenn ci ñi nga tànn amatul. Tànnaatal ñi bokk ci lim bi.',
        'participants_out_of_reach' => 'Ñenn ci ñi nga tànn mënuñu bokk ci kuréel gi : ñi ngay jokkoo ba noppi rekk nga mën a woo.',
        'participants_duplicate' => 'Tànn nga benn nit ñaari yoon.',
        'group_context_forbidden' => 'Mënuloo boole kuréel gi ak lii.',
        // TCK-565, réparation 2 — la conversation directe applique le périmètre du groupe.
        'direct_single_participant' => 'Waxtaan wu ñaari nit, benn nit rekk nga ciy boole. Ngir dajale ay nit, sosal kuréel.',
        'conversation_context_forbidden' => 'Mënuloo boole waxtaan wi ak lii.',
        // TCK-565, passe finale — c'était une phrase française en dur dans AddParticipantsRequest.
        'participants_required' => 'Tànnal lu néew lool benn nit ngir yokk ko ci kuréel gi.',
    ],
];
