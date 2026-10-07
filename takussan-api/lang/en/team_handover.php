<?php

/*
 * TCK-591 — absence, removal and portfolio handover of a staff member.
 */

return [
    'absences' => [
        'not_staff' => 'Both the absent member and the substitute must be agents or administrators of the agency.',
        'same_person' => 'The substitute must be someone other than the absent member.',
        'overlaps' => 'An absence of this member is already scheduled or ongoing over this period.',
    ],
];
