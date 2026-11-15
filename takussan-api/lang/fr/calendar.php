<?php

/*
 * TCK-591 — l'agenda : refus de la console et textes du flux iCalendar (ADR-0034).
 */

return [
    'errors' => [
        'window_too_long' => "La période demandée dépasse :days jours. Réduisez l'intervalle.",
    ],
    // TCK-2502 — une visite demandée par tranche, heure pas encore fixée : sur la journée.
    'visit_window_title' => ':title — :window, heure à fixer',
    'feed' => [
        'name' => 'Takussan — mes rendez-vous',
        'summary' => [
            'booking' => 'Réservation — :title',
            'visit' => 'Visite — :title',
            'visit_window' => 'Visite — :title — :window, heure à fixer',
            'task' => 'Tâche — :title',
            'lease_event_end' => 'Fin de bail — :title',
            'lease_event_renewal' => 'Renouvellement de bail — :title',
            'maintenance' => 'Intervention — :title',
        ],
    ],
];
