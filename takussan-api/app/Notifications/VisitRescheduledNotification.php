<?php

namespace App\Notifications;

use App\Models\PropertyVisit;

/**
 * TCK-590 — la visite change d'heure.
 *
 *   · **Par l'agence** (`PATCH scheduled_at`) : le visiteur est prévenu — compte, ou e-mail et SMS
 *     s'il n'en a pas. `update` déplaçait l'heure sans prévenir personne.
 *   · **Par le visiteur** (`POST …/reschedule`) : l'agence est prévenue, la visite repasse en
 *     attente de confirmation. Jamais de SMS : ce n'est pas un geste de l'agence.
 */
class VisitRescheduledNotification extends VisitNotification
{
    public function __construct(PropertyVisit $visit, public bool $parLeVisiteur = false)
    {
        parent::__construct($visit);
    }

    protected function cle(): string
    {
        return $this->parLeVisiteur ? 'visit_rescheduled_by_visitor' : 'visit_rescheduled';
    }

    protected function envoieUnSms(): bool
    {
        return ! $this->parLeVisiteur;
    }

    public function broadcastType(): string
    {
        return 'visit.rescheduled';
    }
}
