<?php

namespace App\Policies;

use App\Models\Lease;
use App\Models\User;

/**
 * TCK-088 — Authorization for custom lease actions. Standard CRUD remains
 * handled inline in `LeaseController` via `authorizeAccess`/`authorizeManage`;
 * this policy is only consulted for actions that need an explicit Spatie
 * permission gate (refund_deposit, …).
 *
 * The `super_admin` bypass is wired globally via `Gate::before` so it
 * always wins regardless of the rules below.
 */
class LeasePolicy extends BasePolicy
{
    protected function resource(): string
    {
        return 'leases';
    }

    /**
     * Refunding a deposit is reserved to the agency-side (landlord, agency
     * member, or admin) AND requires the explicit `leases.refund_deposit`
     * permission. The tenant — even if they have a User account linked to
     * the customer — cannot trigger a refund on their own lease.
     */
    public function refundDeposit(User $user, Lease $lease): bool
    {
        if (! $user->can('leases.refund_deposit')) {
            return false;
        }

        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return true;
        }

        return $user->hasRole(['admin', 'super_admin']);
    }
}
