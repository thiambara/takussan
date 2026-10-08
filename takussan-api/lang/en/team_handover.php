<?php

/*
 * TCK-591 — absence, removal and portfolio handover of a staff member.
 */

return [
    'absences' => [
        'not_staff' => 'Both the absent member and the substitute must be agents or administrators of the agency.',
        'same_person' => 'The substitute must be someone other than the absent member.',
    ],
    'handover' => [
        'successor_not_staff' => 'The successor must be an agent or an administrator of the agency, other than the departing member.',
        'successor_required' => 'Choose a successor, or confirm that the portfolio stays unassigned.',
    ],
];
