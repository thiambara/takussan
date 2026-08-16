<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Lease;
use App\Models\User;

/**
 * TCK-088 — Authorization for custom lease actions. Standard CRUD remains
 * handled inline in `LeaseController` via `authorizeAccess`/`authorizeManage`;
 * this policy is only consulted for actions that need an explicit capability
 * gate (refund_deposit, …).
 *
 * « Spatie » a été retiré de cette phrase, pas du sens : la porte existe
 * toujours, mais elle passe par l'enum `Capability` et les Gates dérivées
 * (ADR-0002/0003), plus par `spatie/laravel-permission` qui est désinstallé.
 *
 * The `super_admin` bypass is wired globally via `Gate::before` so it
 * always wins regardless of the rules below.
 */
class LeasePolicy extends BasePolicy
{
    /**
     * TCK-297 — seul `leases.create` existe dans `Capability` parmi les cinq
     * abilities CRUD. `leases.view`, `leases.update` et `leases.delete` n'ont
     * jamais existé : la concaténation les fabriquait, la Gate ne les
     * définissait pas, et elles refusaient tout le monde sauf le super-admin.
     *
     * Le cycle de vie réel d'un bail passe par les abilities explicites plus
     * bas (`refundDeposit`, `renew`, `requestEarlyTermination`, `reviewRent`),
     * chacune adossée à une capacité qui, elle, existe.
     */
    protected function createCapability(): ?Capability
    {
        return Capability::LeasesCreate;
    }

    /**
     * Refunding a deposit is reserved to the agency-side (landlord, agency
     * member, or admin) AND requires the explicit `leases.refund_deposit`
     * permission. The tenant — even if they have a User account linked to
     * the customer — cannot trigger a refund on their own lease.
     */
    public function refundDeposit(User $user, Lease $lease): bool
    {
        // TCK-278 — Le landlord direct est toujours autorisé sur ses propres
        // baux (cf. requestEarlyTermination), peu importe son agence.
        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return $user->can('leases.refund_deposit');
        }

        return $user->isSuperAdmin();
    }

    /**
     * TCK-089 — Renouveler un bail (créer un avenant chaîné).
     * Réservé à l'agency-side : landlord, membre d'agence, ou admin.
     * Requiert la capacité `Capability::LeasesRenew` (`leases.renew`) afin
     * que les profils locataire / client ne puissent pas la déclencher même
     * par accident côté UI. Le `$user->can('leases.renew')` ci-dessous passe
     * par la Gate dérivée de l'enum (ADR-0003), plus par spatie.
     */
    public function renew(User $user, Lease $lease): bool
    {
        // TCK-278 — Le landlord direct est toujours autorisé sur ses propres
        // baux (cf. requestEarlyTermination).
        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return $user->can('leases.renew');
        }

        return $user->isSuperAdmin();
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

        // TCK-278 — le landlord direct est toujours autorisé sur ses propres
        // baux (pre-existing : check déplacé avant `can()` puisque la résolution
        // par capacité passe désormais par le profil agence, qui peut être
        // null pour un bailleur particulier sans agency rattachée).
        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return $user->can('leases.terminate');
        }

        return $user->isSuperAdmin();
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
        // TCK-278 — Le landlord direct est toujours autorisé (cf.
        // requestEarlyTermination).
        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return $user->can('leases.terminate');
        }

        return $user->isSuperAdmin();
    }

    /**
     * TCK-091 — Annual rent review. Restricted to agency-side actors
     * (landlord, agency members, admin) holding `leases.rent_review`.
     * The tenant cannot self-review their own rent — they receive a
     * notification once the agency-side actor confirms the change.
     */
    public function reviewRent(User $user, Lease $lease): bool
    {
        // TCK-278 — Le landlord direct est toujours autorisé (cf.
        // requestEarlyTermination).
        if ($user->id === $lease->landlord_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $lease->agency_id) {
            return $user->can('leases.rent_review');
        }

        return $user->isSuperAdmin();
    }
}
