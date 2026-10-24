<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use App\Services\Property\BailleurDuBien;

/**
 * TCK-098 — Only agency_admin or super_admin within the property's agency
 * may approve or reject. The super_admin bypass is handled globally via
 * Gate::before and does not need to be repeated here.
 */
class PropertyModerationPolicy
{
    /**
     * TCK-597 (ADR-0043 §4) — un bien sous verrou plateforme n'est approuvé que par un super-admin
     * (qui passe par `Gate::before`) : l'admin d'agence ne défait pas une décision plateforme.
     */
    public function approve(User $user, Property $property): bool
    {
        return ! $property->isUnderPlatformHold() && $this->canModerate($user, $property);
    }

    public function reject(User $user, Property $property): bool
    {
        return $this->canModerate($user, $property);
    }

    public function resubmit(User $user, Property $property): bool
    {
        // TCK-2029 (P190.06) — `user_id` est le CRÉATEUR du bien : sur un bien d'agence, souvent
        // l'agent qui l'a saisi. Il ne vaut titre que sur un bien sans agence, ou pour un bailleur
        // de l'agence qui n'y est pas bloqué (la règle de `BasePolicy::bailleurEcrit`, que cette
        // policy n'hérite pas). L'agent n'entre que par la branche du personnel actif, ci-dessous.
        if (BailleurDuBien::est($user, $property->user_id, $property->agency_id)
            && ($property->agency_id === null || ! $user->isBlockedOwnerAt((int) $property->agency_id))) {
            return true;
        }

        // TCK-587 — « tout membre » était aussi un autre bailleur de l'agence : le personnel seul.
        $staffAgencyId = $user->staffAgencyId();

        return $staffAgencyId !== null && $staffAgencyId === (int) $property->agency_id;
    }

    private function canModerate(User $user, Property $property): bool
    {
        if ($user->isSuperAdmin()) {
            return true;
        }

        // TCK-278 — agency_admin scoped to the property's agency only.
        // The active-profile-aware `$user->agency_id` accessor enforces
        // that the admin is currently acting under the right agency.
        $agencyId = $user->agency_id;
        if ($agencyId === null || $agencyId !== $property->agency_id) {
            return false;
        }

        return $this->moderatesAt($user, (int) $agencyId);
    }

    /**
     * TCK-2022 (P116.05, décision du porteur) — approuver un bien en attente le PUBLIE : la
     * modération d'agence exige l'admin de l'agence ET `properties.publish` à cette agence, patron
     * d'`AgencyPolicy::updatePayoutThreshold`. Aucun agent ne la gagne, même s'il tient la capacité.
     * Lue par `canModerate` et par la file (`PropertyModerationController::index`).
     */
    public function moderatesAt(User $user, int $agencyId): bool
    {
        $agency = Agency::query()->find($agencyId);

        return $agency !== null
            && $user->isAgencyAdminAt($agencyId)
            && $user->canActAt(Capability::PropertiesPublish, $agency);
    }
}
