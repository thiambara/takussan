<?php

namespace App\Services\Agency;

use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Collection;

/**
 * TCK-591 (ADR-0035) — qui reprend le travail d'un agent absent.
 *
 * Lecteur des lignes d'absence de `role_delegations` dans leur fenêtre ACTIVE (la fenêtre est
 * celle de `RoleDelegation::scopeActive()`, source unique depuis TCK-456). Il n'accorde aucun
 * droit : il dit seulement à qui router une affectation, et qui couvre qui.
 *
 * **Pas de transitivité** : si le remplaçant est lui-même absent, la chaîne s'arrête au premier
 * remplaçant — une chaîne se lit mal et peut boucler.
 *
 * TCK-591 (verif-591 M5) — un remplaçant ne couvre que tant qu'il est PERSONNEL actif de l'agence
 * de l'absence (`isStaffAt`) : suspendu ou retiré, il ne lit plus, ne coche plus et ne reçoit plus
 * le travail de l'absent ; l'affectation retombe sur l'absent.
 */
class AgentAvailability
{
    public function __construct(private readonly MembershipCapabilityResolver $membership) {}

    /** Le remplaçant de l'absence active de `$absent` dans l'agence, sinon `$absent` lui-même. */
    public function substituteFor(User $absent, int $agencyId): User
    {
        $absence = RoleDelegation::query()
            ->absences()
            ->active()
            ->where('agency_id', $agencyId)
            ->where('replaces_user_id', $absent->id)
            ->latest('id')
            ->first();

        $substitute = $absence?->user;

        return $substitute !== null && $this->membership->isStaffAt($substitute, $agencyId)
            ? $substitute
            : $absent;
    }

    /** `$substitute` couvre-t-il aujourd'hui `$absentId` dans l'agence ? */
    public function covers(User $substitute, int $absentId, int $agencyId): bool
    {
        return RoleDelegation::query()
            ->absences()
            ->active()
            ->where('agency_id', $agencyId)
            ->where('user_id', $substitute->id)
            ->where('replaces_user_id', $absentId)
            ->exists()
            && $this->membership->isStaffAt($substitute, $agencyId);
    }

    /**
     * Les absences que `$substitute` couvre en ce moment.
     *
     * @return Collection<int, array{absent_id: int, agency_id: int}>
     */
    public function coveredBy(User $substitute): Collection
    {
        $staffAgencyIds = $this->membership->staffAgencyIds($substitute);

        return RoleDelegation::query()
            ->absences()
            ->active()
            ->where('user_id', $substitute->id)
            ->whereIn('agency_id', $staffAgencyIds)
            ->get(['replaces_user_id', 'agency_id'])
            ->map(fn (RoleDelegation $d) => ['absent_id' => (int) $d->replaces_user_id, 'agency_id' => (int) $d->agency_id])
            ->values();
    }
}
