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

        return $user->isSuperAdmin() || $user->hasRole('admin');
    }

    /**
     * TCK-089 — Renouveler un bail (créer un avenant chaîné).
     * Réservé à l'agency-side : landlord, membre d'agence, ou admin.
     * Requiert la permission `leases.renew` (Spatie) afin que les rôles
     * `tenant` / `customer` ne puissent pas la déclencher même par
     * accident côté UI.
     */
    public function renew(User $user, Lease $lease): bool
    {
        if (! $user->can('leases.renew')) {
            return false;
        }

        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return true;
        }

        return $user->isSuperAdmin() || $user->hasRole('admin');
    }

    /**
     * TCK-090 — Initiate early termination of a lease.
     *
     * Allowed actors:
     *   - Tenant of this lease (via `tenant.user_id`).
     *   - Agency-side actor (landlord / agency member / admin) holding the
     *     `leases.terminate` permission — covers an agent acting on the
     *     bailleur's behalf.
     *
     * `super_admin` is granted globally via `Gate::before`.
     */
    public function requestEarlyTermination(User $user, Lease $lease): bool
    {
        if ($lease->tenant && $lease->tenant->user_id === $user->id) {
            return true;
        }

        if (! $user->can('leases.terminate')) {
            return false;
        }

        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return true;
        }

        return $user->isSuperAdmin() || $user->hasRole('admin');
    }

    /**
     * TCK-090 — Cancel a pending early-termination request. Same actors as
     * `requestEarlyTermination`: whoever can open the request can call it
     * back (within the cancellation window — service-level guard).
     */
    public function cancelEarlyTermination(User $user, Lease $lease): bool
    {
        return $this->requestEarlyTermination($user, $lease);
    }

    /**
     * TCK-090 — Confirm the transition into `terminated`. Restricted to
     * agency-side actors and the daily job (which authenticates as a
     * system user with the permission). Tenants do not get to mark the
     * lease as definitively closed.
     */
    public function confirmEarlyTermination(User $user, Lease $lease): bool
    {
        if (! $user->can('leases.terminate')) {
            return false;
        }

        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return true;
        }

        return $user->isSuperAdmin() || $user->hasRole('admin');
    }

    /**
     * TCK-091 — Annual rent review. Restricted to agency-side actors
     * (landlord, agency members, admin) holding `leases.rent_review`.
     * The tenant cannot self-review their own rent — they receive a
     * notification once the agency-side actor confirms the change.
     */
    public function reviewRent(User $user, Lease $lease): bool
    {
        if (! $user->can('leases.rent_review')) {
            return false;
        }

        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return true;
        }

        return $user->isSuperAdmin() || $user->hasRole('admin');
    }
}
