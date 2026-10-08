<?php

namespace App\Services\Dashboard;

use App\Contracts\DashboardMetrics;
use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Property;
use App\Models\User;
use App\Services\Dashboard\Adapters\AgencyMeMetrics;
use App\Services\Dashboard\Adapters\AgentMeMetrics;
use App\Services\Dashboard\Adapters\OwnerMeMetrics;
use App\Services\Dashboard\Adapters\TenantMeMetrics;

/**
 * Picks the right DashboardMetrics adapter for GET /api/dashboard/me.
 *
 * Priority (per TCK-032 contract, amended by TCK-595):
 *   1. super_admin with agency_id                     → agency view
 *   2. agency_admin of a `standard` agency            → agency view
 *   3. agency_admin of an `individual` agency (host)  → owner view
 *   4. agent with agency                              → agent view
 *   5. owner role OR owns properties                  → owner view
 *   6. anyone else                                    → tenant view, never null
 *
 * TCK-595 — l'hôte créé par « Publier » est `agency_admin` + `owner` d'une agence `individual`
 * (`docs/features.md` §2.5 réserve le tableau de bord d'agence aux agences `standard`) : il atterrissait
 * sur des chiffres d'agence cross-équipe qui ne le concernent pas. Et un compte sans fiche `Customer`
 * (la fiche ne naît qu'à la première réservation ou au premier contact) recevait 404 et l'état vide
 * générique, au lieu de son accueil de client.
 *
 * super_admin without agency_id falls through to the owner view when he owns properties, otherwise
 * to the tenant view.
 */
class DashboardRoleResolver
{
    public function __construct(
        private readonly AgencyMeMetrics $agency,
        private readonly AgentMeMetrics $agent,
        private readonly OwnerMeMetrics $owner,
        private readonly TenantMeMetrics $tenant,
    ) {}

    public function resolve(User $user): DashboardMetrics
    {
        $agencyId = $user->agency_id;

        if ($agencyId !== null && $user->isSuperAdmin()) {
            return $this->agency;
        }

        if ($agencyId !== null && $user->isAgencyAdminAt((int) $agencyId)) {
            $kind = Agency::query()->whereKey($agencyId)->value('kind');

            return ($kind instanceof AgencyKind ? $kind : AgencyKind::tryFrom((string) $kind)) === AgencyKind::Individual
                ? $this->owner
                : $this->agency;
        }

        if ($agencyId !== null && $user->isAgentAt((int) $agencyId)) {
            return $this->agent;
        }

        if (($agencyId !== null && $user->isOwnerAt((int) $agencyId))
            || Property::where('user_id', $user->id)->exists()) {
            return $this->owner;
        }

        // TCK-595 — tout le reste est un client, fiche `Customer` ou non (TCK-278 : `customer` est
        // un rôle dérivé, le plancher de toute identité authentifiée).
        return $this->tenant;
    }
}
