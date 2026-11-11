<?php

/*
 * TCK-591 — absence, retrait et passation du portefeuille d'un membre du personnel. Fichier propre
 * au ticket : `errors.php` est créé par TCK-587 et TCK-588 en parallèle (brief de la vague 73, lot B).
 */

return [
    'absences' => [
        'not_staff' => "L'absent et le remplaçant doivent être agents ou administrateurs de l'agence.",
        'same_person' => "Le remplaçant doit être une autre personne que l'absent.",
        // TCK-2666 — modifier une absence, et le rôle prêté par sa délégation liée.
        'already_started' => 'L\'absence a commencé : sa date de début ne se modifie plus.',
        'ends_before_start' => 'La fin de l\'absence doit suivre son début.',
        'no_base_role' => 'L\'absent n\'a ni rôle d\'agent ni rôle d\'administrateur dans l\'agence : il n\'y a pas de rôle à prêter au remplaçant.',
    ],
    'handover' => [
        'successor_not_staff' => "Le repreneur doit être un agent ou un administrateur de l'agence, autre que le partant.",
        'successor_required' => 'Choisissez un repreneur, ou confirmez que le portefeuille reste sans repreneur.',
    ],
];
