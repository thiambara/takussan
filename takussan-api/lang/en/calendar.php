<?php

/*
 * TCK-591 — the calendar: console refusals and iCalendar feed texts (ADR-0034).
 */

return [
    'errors' => [
        'cross_agency_forbidden' => "Only platform administrators can view another agency's calendar.",
        'window_too_long' => 'The requested period exceeds :days days. Narrow the range.',
        'feed_not_staff' => 'The calendar link is reserved for agency staff and service providers.',
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
