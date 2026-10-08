<?php

namespace App\Services\Payout;

use App\Models\Agency;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\RoleDelegation;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;
use Illuminate\Support\Collection;

/**
 * TCK-594 (ADR-0039 §4) — les membres ACTIFS d'une agence qui détiennent une capacité.
 *
 * Sert deux règles : le seuil d'approbation ne s'active qu'avec deux détenteurs de
 * `payouts.approve`, et un reversement en attente notifie ses approbateurs possibles. Un membre se
 * lit comme le personnel d'ADR-0031 : profil d'agent ou d'admin actif, ou délégation active de ces
 * rôles ; la capacité, par le résolveur — un rôle personnalisé qui la retire retire le membre.
 */
final class PayoutApprovers
{
    public function __construct(private readonly MembershipCapabilityResolver $resolver) {}

    /** @return Collection<int, User> */
    public function holders(Agency $agency, Capability $capability = Capability::PayoutsApprove): Collection
    {
        $ids = collect();
        foreach ([AgencyRoleBaseType::Agent, AgencyRoleBaseType::AgencyAdmin] as $type) {
            $class = $type->profileClass();
            if ($class !== null) {
                $ids = $ids->merge($class::query()->where('agency_id', $agency->id)->active()->pluck('user_id'));
            }
        }

        $ids = $ids->merge(RoleDelegation::query()
            ->where('agency_id', $agency->id)
            ->whereIn('role', [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::AgencyAdmin->value])
            ->active()
            ->pluck('user_id'));

        return User::query()
            ->whereIn('id', $ids->unique()->values())
            ->get()
            ->filter(fn (User $user): bool => $this->resolver->allows($user, $capability, $agency))
            ->values();
    }
}
