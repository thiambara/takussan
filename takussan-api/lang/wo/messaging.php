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
        // TCK-2191 (P191.04) — un groupe rattaché à un bail ne compte que qui lit ce bail.
        'participants_cannot_read_lease' => 'Certaines personnes choisies ne peuvent pas rejoindre ce groupe : il est rattaché à un bail, et seules les personnes qui ont accès à ce bail peuvent y participer. Pour échanger avec elles, créez un groupe sans bail rattaché.',
        'group_context_forbidden' => 'Mënuloo boole kuréel gi ak lii.',
        // TCK-565, réparation 2 — la conversation directe applique le périmètre du groupe.
        'direct_single_participant' => 'Waxtaan wu ñaari nit, benn nit rekk nga ciy boole. Ngir dajale ay nit, sosal kuréel.',
        'conversation_context_forbidden' => 'Mënuloo boole waxtaan wi ak lii.',
        // TCK-576, réparation 1 — un bail et un bien visibles, mais sans rapport, se refusent.
        'lease_property_mismatch' => 'Kontaaru lokal bii jëmul ci ber bi nga tànn. Tànnal kontaaru lokal bu ber bii, walla nga génne benn ci ñoom.',
        // TCK-565, passe finale — c'était une phrase française en dur dans AddParticipantsRequest.
        'participants_required' => 'Tànnal lu néew lool benn nit ngir yokk ko ci kuréel gi.',
    ],
    // TCK-576, reprise (2026-09-24) — le nom du champ dans un 422, jamais « filter.property id ».
    'attributes' => [
        'property_filter' => 'ber',
    ],

    // TCK-592 — ADR-0038 : aperçu d'une note vocale dans la liste des conversations.
    'audio_preview' => 'Kàddu bu ñu yónnee',
];
