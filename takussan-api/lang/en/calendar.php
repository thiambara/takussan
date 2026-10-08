<?php

/*
 * TCK-591 — the calendar: console refusals and iCalendar feed texts (ADR-0034).
 */

return [
    'errors' => [
        'window_too_long' => 'The requested period exceeds :days days. Narrow the range.',
    ],
    'feed' => [
        'name' => 'Takussan — my appointments',
        'summary' => [
            'booking' => 'Booking — :title',
            'visit' => 'Viewing — :title',
            'task' => 'Task — :title',
            'lease_event_end' => 'Lease ends — :title',
            'lease_event_renewal' => 'Lease renewal — :title',
            'maintenance' => 'Maintenance — :title',
        ],
    ],
];
