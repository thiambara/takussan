<?php

namespace App\Notifications;

use App\Models\PropertyVisit;

/**
 * TCK-590 — la visite est annulée. `cancel` ne prévenait personne.
 *
 *   · **Par l'agence** : le visiteur est prévenu (compte, ou e-mail et SMS sans compte).
 *   · **Par le visiteur** : l'agent assigné, ou — visite non attribuée — les admins de l'agence.
 *
 * Le motif saisi n'est pas recopié dans l'envoi au visiteur sans compte : aucun texte libre ne
 * part vers un numéro qu'un tiers a pu saisir (contrainte 4).
 */
class VisitCancelledNotification extends VisitNotification
{
    public function __construct(PropertyVisit $visit, public bool $parLeVisiteur = false)
    {
        parent::__construct($visit);
    }

    protected function cle(): string
    {
        return $this->parLeVisiteur ? 'visit_cancelled_by_visitor' : 'visit_cancelled';
    }

    protected function envoieUnSms(): bool
    {
        return ! $this->parLeVisiteur;
    }

    public function broadcastType(): string
    {
        return 'visit.cancelled';
    }
}
