<?php

/*
 * TCK-591 — l'agenda : refus de la console et textes du flux iCalendar (ADR-0034).
 */

return [
    'errors' => [
        'cross_agency_forbidden' => "Seuls les administrateurs de la plateforme consultent l'agenda d'une autre agence.",
        'window_too_long' => "La période demandée dépasse :days jours. Réduisez l'intervalle.",
        'feed_not_staff' => "Le lien d'agenda est réservé au personnel d'une agence et aux prestataires.",
    ],
    'feed' => [
        'name' => 'Takussan — mes rendez-vous',
        'summary' => [
            'booking' => 'Réservation — :title',
            'visit' => 'Visite — :title',
            'task' => 'Tâche — :title',
            'lease_event_end' => 'Fin de bail — :title',
            'lease_event_renewal' => 'Renouvellement de bail — :title',
            'maintenance' => 'Intervention — :title',
        ],
    ],
];
