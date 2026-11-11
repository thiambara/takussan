<?php

/*
 * TCK-591 — absence, removal and portfolio handover of a staff member.
 */

return [
    'absences' => [
        'not_staff' => 'Both the absent member and the substitute must be agents or administrators of the agency.',
        'same_person' => 'The substitute must be someone other than the absent member.',
        // TCK-2666 — modifier une absence, et le rôle prêté par sa délégation liée.
        'already_started' => 'The absence has started: its start date can no longer be changed.',
        'ends_before_start' => 'The end of the absence must come after its start.',
        'no_base_role' => 'The absent member holds neither an agent nor an administrator role in the agency: there is no role to lend the substitute.',
    ],
    'handover' => [
        'successor_not_staff' => 'The successor must be an agent or an administrator of the agency, other than the departing member.',
        'successor_required' => 'Choose a successor, or confirm that the portfolio stays unassigned.',
    ],
];
