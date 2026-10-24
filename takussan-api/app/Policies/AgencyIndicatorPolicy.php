<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\KpiConfig;
use App\Models\ThresholdAlert;
use App\Models\User;

/**
 * TCK-1701 (P82.04) — créer, modifier et supprimer un indicateur du tableau de bord (`KpiConfig`)
 * ou une alerte de seuil (`ThresholdAlert`) : la capacité `agency.update` DANS l'agence visée,
 * sous le profil actif de cette agence. Liée aux deux modèles dans `AppServiceProvider`.
 *
 * Avant : `isAgencyAdminAt` seul, recopié dans quatre FormRequests et deux contrôleurs. Un admin
 * dont le rôle personnalisé retirait toutes les capacités configurait les indicateurs ; un agent
 * dont le rôle les portait toutes en était refusé. Même forme qu'{@see AgencyPolicy::updateKyc()} :
 * un rôle personnalisé peut donner la capacité à un membre et la retirer à un admin, et
 * l'administrateur principal ne s'en enferme pas dehors.
 *
 * La LECTURE (`index`) n'est pas jugée ici : elle reste au personnel de l'agence (TCK-587).
 * Le super-admin passe par `Gate::before` ; il est retesté pour les appels hors Gate.
 */
class AgencyIndicatorPolicy
{
    /** `$agency` : l'agence que `store` résoudra — celle du profil actif. `null` → refus. */
    public function create(User $user, ?Agency $agency = null): bool
    {
        return $agency !== null && $this->managesIndicatorsOf($user, $agency);
    }

    public function update(User $user, KpiConfig|ThresholdAlert $indicator): bool
    {
        return $this->managesIndicatorsOf($user, $indicator->agency);
    }

    public function delete(User $user, KpiConfig|ThresholdAlert $indicator): bool
    {
        return $this->managesIndicatorsOf($user, $indicator->agency);
    }

    private function managesIndicatorsOf(User $user, ?Agency $agency): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        if ($agency === null) {
            return false;
        }

        if ($agency->primary_admin_id === $user->id) {
            return true;
        }

        return $user->activeProfile()?->agency_id === $agency->id
            && $user->canActAt(Capability::AgencyUpdate, $agency);
    }
}
