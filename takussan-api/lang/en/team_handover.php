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
    'removal' => [
        'member_not_staff' => 'Only an agent or an administrator of the agency can be removed from the team; a landlord is not part of it.',
        'portfolio_not_empty' => 'This member still holds a portfolio: hand it over, or confirm the removal without a successor.',
    ],
    'handover' => [
        'successor_not_staff' => 'The successor must be an agent or an administrator of the agency, other than the departing member.',
        'member_not_staff' => 'A handover only applies to an agent or an administrator of the agency; a landlord is not handed over.',
        'successor_required' => 'Choose a successor, or confirm that the portfolio stays unassigned.',
    ],
];
