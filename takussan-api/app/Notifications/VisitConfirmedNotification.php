<?php

namespace App\Notifications;

/**
 * TCK-075 — Delivered to the visiting user once the agent/owner has
 * confirmed the visit request.
 *
 * TCK-590 — aussi au visiteur SANS compte, par e-mail et par SMS (`Notification::route`), dans la
 * langue enregistrée sur la visite ; l'heure est donnée à Dakar, suivie du fuseau. Le SMS suit un
 * geste humain de l'agence : c'est la seule raison pour laquelle il est permis ici.
 */
class VisitConfirmedNotification extends VisitNotification
{
    protected function cle(): string
    {
        return 'visit_confirmed';
    }

    protected function envoieUnSms(): bool
    {
        return true;
    }

    public function broadcastType(): string
    {
        return 'visit.confirmed';
    }
}
