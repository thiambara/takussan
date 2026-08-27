<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\Enums\Capability;
use App\Models\RoleDelegation;
use App\Models\User;

class RoleDelegationPolicy
{
    /**
     * Membre de l'agence ET (administrateur principal OU porteur de
     * `team.delegate_role`).
     *
     * TCK-395 — cette policy gardait par TYPE DE PROFIL
     * (`$user->isAgencyAdminAt(...)`), et le catalogue `Capability` n'avait
     * aucun cas pour le geste de délégation. C'est une violation du principe
     * n°1 dans son versant opérationnel : *une capacité se juge pour un couple
     * (utilisateur, agence)*, pas sur la présence d'un profil. Depuis TCK-279,
     * deux `agency_admin` de la même agence peuvent porter des `AgencyRole`
     * différents — l'un dépouillé, l'autre non — et cette policy les traitait
     * identiquement.
     *
     * L'écran de TCK-369 gardait déjà son bouton par une capacité
     * (`team.assign_role`), faute qu'il en existe une pour ce geste : l'écran
     * et la policy ne posaient donc pas la même question, et c'est la policy
     * qui tranchait.
     *
     * `primary_admin_id` reste un court-circuit : le porteur du compte de
     * l'agence ne peut pas se retrouver enfermé dehors par l'édition d'un
     * rôle, y compris la sienne.
     */
    public function viewAny(User $user, Agency $agency): bool
    {
        if ($user->agency_id !== $agency->id) {
            return false;
        }

        return $agency->primary_admin_id === $user->id
            || $user->canActAt(Capability::TeamDelegateRole, $agency);
    }

    /**
     * Determine if the user can view a specific delegation.
     * Admin can view all; beneficiary can view their own.
     */
    public function view(User $user, RoleDelegation $delegation): bool
    {
        if ($this->viewAny($user, $delegation->agency)) {
            return true;
        }

        return $user->id === $delegation->user_id;
    }

    /**
     * Determine if the user can create a delegation in an agency.
     * Same rules as viewAny.
     */
    public function create(User $user, Agency $agency): bool
    {
        return $this->viewAny($user, $agency);
    }

    /**
     * Determine if the user can revoke a delegation.
     * Same rules as viewAny (admin only).
     */
    public function revoke(User $user, RoleDelegation $delegation): bool
    {
        return $this->viewAny($user, $delegation->agency);
    }
}
