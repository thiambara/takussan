<?php

/*
 * TCK-591 — the calendar: console refusals and iCalendar feed texts (ADR-0034).
 */

return [
    'errors' => [
        'window_too_long' => 'The requested period exceeds :days days. Narrow the range.',
    ],
    // TCK-2502 — a visit requested by time of day, time not set yet: all-day.
    'visit_window_title' => ':title — :window, time to be set',
    'feed' => [
        'name' => 'Takussan — my appointments',
        'summary' => [
            'booking' => 'Booking — :title',
            'visit' => 'Viewing — :title',
            'visit_window' => 'Viewing — :title — :window, time to be set',
            'task' => 'Task — :title',
            'lease_event_end' => 'Lease ends — :title',
            'lease_event_renewal' => 'Lease renewal — :title',
            'maintenance' => 'Maintenance — :title',
        ],
    ],
];
