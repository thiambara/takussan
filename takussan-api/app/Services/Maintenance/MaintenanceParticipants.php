<?php

namespace App\Services\Maintenance;

use App\Models\Enums\Capability;
use App\Models\MaintenanceRequest;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Collection;

/**
 * TCK-592 — qui est partie à une intervention, en dehors du prestataire et du demandeur.
 *
 * Les **donneurs d'ordre** : le bailleur du bien et l'équipe de son agence qui tient
 * `maintenance.assign` (la branche équipe de `MaintenanceRequestPolicy::actAsPrincipal`). Le devis
 * soumis notifiait `$mr->requester ?? owner` — le locataire, le plus souvent — et jamais l'agence.
 */
class MaintenanceParticipants
{
    /**
     * @return Collection<int, User>
     */
    public function principals(MaintenanceRequest $mr): Collection
    {
        $property = $mr->property;
        if ($property === null) {
            return collect();
        }

        $principals = collect([$property->owner]);

        $agency = $property->agency;
        if ($agency !== null) {
            // Candidats par profil ou délégation, tous états ; le prédicat du personnel (TCK-587)
            // tranche — un agent suspendu n'est plus prévenu.
            $resolver = app(MembershipCapabilityResolver::class);
            $team = User::query()
                ->where(fn ($q) => $q
                    ->whereHas('agentProfiles', fn ($p) => $p->where('agency_id', $agency->id))
                    ->orWhereHas('agencyAdminProfiles', fn ($p) => $p->where('agency_id', $agency->id))
                    ->orWhereHas('roleDelegations', fn ($d) => $d->where('agency_id', $agency->id)))
                ->get()
                ->filter(fn (User $member): bool => $resolver->isStaffAt($member, (int) $agency->id)
                    && $member->canActAt(Capability::MaintenanceAssign, $agency));

            $principals = $principals->merge($team);
        }

        return $principals->filter()->unique('id')->values();
    }
}
