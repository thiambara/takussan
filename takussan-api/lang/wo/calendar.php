<?php

/*
 * TCK-591 — ajandaa bi : tere yu konsol bi ak mbind yu flux iCalendar bi (ADR-0034).
 */

return [
    'errors' => [
        'window_too_long' => 'Diir bi nga laaj ëpp na :days fan. Wàññi ko.',
    ],
    // TCK-2502 — une visite demandée par tranche, heure pas encore fixée : sur la journée.
    'visit_window_title' => ':title — :window, heure à fixer',
    'feed' => [
        'name' => 'Takussan — samay ndaje',
        'summary' => [
            'booking' => 'Réservation — :title',
            'visit' => 'Seetlu — :title',
            'visit_window' => 'Visite — :title — :window, heure à fixer',
            'task' => 'Liggéey — :title',
            'lease_event_end' => 'Jeexitu bail — :title',
            'lease_event_renewal' => 'Yeesal bail — :title',
            'maintenance' => 'Defar — :title',
        ],
    ],
];
