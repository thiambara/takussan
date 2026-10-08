<?php

namespace App\Events\Maintenance;

use App\Models\Enums\MaintenanceStatus;
use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * TCK-592 — une intervention a changé de statut ou d'assignation.
 *
 * Émis par CHAQUE chemin qui touche l'un ou l'autre — machine d'état, devis, `complete`,
 * acceptation et refus, confirmation et contestation, désassignation à la fin d'une collaboration,
 * clôture automatique —, une fois par changement. `from === to` quand seule l'assignation ou
 * l'acceptation a bougé. `actor` est `null` pour un geste du système (clôture automatique, fin
 * d'onboarding).
 *
 * Ce ticket ne crée pas d'observateur de modèle : TCK-594 crée `MaintenanceRequestObserver`
 * (facture prestataire) et lit cet événement. Avec la clôture contradictoire, `closed` — et non
 * `completed` — est le moment où le travail est reconnu.
 *
 * `ShouldDispatchAfterCommit` : les écouteurs voient la ligne écrite, jamais une transaction en vol.
 */
class MaintenanceStatusChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable, SerializesModels;

    public const CAUSE_TRANSITION = 'transition';

    public const CAUSE_ASSIGNED = 'assigned';

    public const CAUSE_UNASSIGNED = 'unassigned';

    public const CAUSE_ACCEPTED = 'accepted';

    public const CAUSE_DECLINED = 'declined';

    public const CAUSE_QUOTE_REQUESTED = 'quote_requested';

    public const CAUSE_QUOTE_SUBMITTED = 'quote_submitted';

    public const CAUSE_QUOTE_APPROVED = 'quote_approved';

    public const CAUSE_QUOTE_AWAITING_OWNER = 'quote_awaiting_owner';

    public const CAUSE_QUOTE_REJECTED = 'quote_rejected';

    public const CAUSE_COMPLETED = 'completed';

    public const CAUSE_CONFIRMED = 'confirmed';

    public const CAUSE_CONTESTED = 'contested';

    public const CAUSE_AUTO_CLOSED = 'auto_closed';

    /**
     * @param  array<string, mixed>  $context  `previous_assignee_id`, `reason`, `comment`…
     */
    public function __construct(
        public MaintenanceRequest $maintenanceRequest,
        public ?MaintenanceStatus $from,
        public MaintenanceStatus $to,
        public ?User $actor,
        public string $cause = self::CAUSE_TRANSITION,
        public array $context = [],
    ) {}
}
