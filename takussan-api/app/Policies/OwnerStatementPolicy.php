<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Payout\BeneficiaireDuReversement;

/**
 * TCK-594 (ADR-0039 §3) — qui lit le relevé de gérance d'un bailleur dans une agence.
 *
 * Le bailleur lit le sien, dans une agence où il est bénéficiaire des reversements (TCK-997 : le
 * bailleur, ou le personnel actif pour un bien que l'agence garde). Un membre du PERSONNEL de cette
 * agence qui détient `payouts.create` lit ceux de ses bailleurs. Un autre bailleur de la même
 * agence, non : l'agence n'est pas un périmètre pour qui n'en est pas le personnel (ADR-0031).
 *
 * Liée par `Gate::define('viewOwnerStatement', …)` : le relevé n'est pas un modèle.
 */
class OwnerStatementPolicy
{
    public function view(User $user, User $landlord, Agency $agency): bool
    {
        if (! $this->isLandlordAt($landlord, $agency)) {
            return false;
        }

        if ($user->id === $landlord->id) {
            return true;
        }

        return $user->staffAgencyId() === (int) $agency->id
            && $user->canActAt(Capability::PayoutsCreate, $agency);
    }

    /**
     * TCK-997 (P50.02, Q1) — le relevé suit le reversement : son titulaire est celui que
     * {@see BeneficiaireDuReversement} admet, bailleur ou personnel actif d'un bien que l'agence garde.
     *
     * TCK-2015 (P175.03) — un compte effacé a perdu ses profils (`endProfiles()`, en douceur) : il
     * reste le bailleur de l'agence dont il garde un profil, même supprimé, pour son seul relevé.
     */
    private function isLandlordAt(User $landlord, Agency $agency): bool
    {
        if (! $landlord->trashed()) {
            return BeneficiaireDuReversement::est($landlord, (int) $agency->id);
        }

        return OwnerProfile::withTrashed()
            ->where('user_id', $landlord->id)
            ->where('agency_id', $agency->id)
            ->exists();
    }
}
