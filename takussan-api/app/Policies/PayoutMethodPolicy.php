<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\PayoutMethod;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;

/**
 * TCK-594 (ADR-0039 §6) — une destination de paiement appartient à son titulaire, et à lui seul.
 *
 * Le titulaire la lit en clair, la crée, la modifie, la supprime. L'agence la lit MASQUÉE et la
 * vérifie : un membre du personnel qui détient `payouts.create` dans une agence dont le titulaire est
 * bailleur ou prestataire. Personne ne vérifie sa propre destination.
 *
 * ⚠ N'étend pas `BasePolicy` : aucune ability ne se juge sur un `agency_id` de la ligne (une
 * destination n'en a pas — elle suit son titulaire d'une agence à l'autre).
 */
class PayoutMethodPolicy
{
    public function update(User $user, PayoutMethod $method): bool
    {
        return $method->user_id === $user->id;
    }

    public function delete(User $user, PayoutMethod $method): bool
    {
        return $method->user_id === $user->id;
    }

    /** Lire (masquées) les destinations d'un titulaire : le personnel d'une agence qui le paie. */
    public function viewHolder(User $user, User $holder): bool
    {
        // VERIF-594 N-1 — l'approbateur lit aussi les destinations (masquées) du bénéficiaire : il
        // peut fixer celle du reversement en l'approuvant. Il ne les vérifie pas pour autant.
        return $holder->id === $user->id || $this->paysHolder($user, $holder, approverReads: true);
    }

    public function verify(User $user, PayoutMethod $method): bool
    {
        $holder = $method->user;

        return $holder !== null && $holder->id !== $user->id && $this->paysHolder($user, $holder);
    }

    private function paysHolder(User $user, User $holder, bool $approverReads = false): bool
    {
        $agencyId = $user->staffAgencyId();
        if ($agencyId === null) {
            return false;
        }

        $agency = Agency::query()->find($agencyId);
        $allowed = $agency !== null && ($user->canActAt(Capability::PayoutsCreate, $agency)
            || ($approverReads && $user->canActAt(Capability::PayoutsApprove, $agency)));
        if (! $allowed) {
            return false;
        }

        return $holder->hasProfileAt($agencyId, OwnerProfile::class)
            || $holder->serviceProviderProfile?->agencies()->whereKey($agencyId)->exists() === true;
    }
}
