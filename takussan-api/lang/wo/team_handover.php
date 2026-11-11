<?php

/*
 * TCK-591 — ñàkk, génne ak jox sa liggéey ci kenn ci liggéeykat yi.
 */

return [
    'absences' => [
        'not_staff' => 'Ki ñàkk ak ki koy wuutu, ñoom ñaar war nañu doon ajaŋ walla njiitu ajaans bi.',
        'same_person' => 'Ki koy wuutu war na doon keneen ku dul ki ñàkk.',
        // TCK-2666 — modifier une absence, et le rôle prêté par sa délégation liée.
        'already_started' => 'L\'absence a commencé : sa date de début ne se modifie plus.',
        'ends_before_start' => 'La fin de l\'absence doit suivre son début.',
        'no_base_role' => 'L\'absent n\'a ni rôle d\'agent ni rôle d\'administrateur dans l\'agence : il n\'y a pas de rôle à prêter au remplaçant.',
    ],
    'handover' => [
        'successor_not_staff' => 'Ki koy jël war na doon ajaŋ walla njiitu ajaans bi, te du ki dem.',
        'successor_required' => 'Tànnal ku koy jël, walla nangu ne liggéey yi dañuy des te kenn du leen jël.',
    ],
];
