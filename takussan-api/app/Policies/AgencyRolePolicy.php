<?php

namespace App\Policies;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\Capability;
use App\Models\User;

/**
 * TCK-279 — gate de la console `/admin/roles`.
 *
 * La policy **désigne** ses capacités : chaque méthode nomme un cas typé de
 * `Capability`, elle n'en fabrique aucun par concaténation. Une capacité
 * construite à partir d'un nom de ressource peut ne correspondre à aucun cas
 * de l'enum, et une autorisation qui interroge une capacité inexistante est
 * refusée en silence — le défaut que `BasePolicy` a payé (TCK-297).
 *
 * `super_admin` court-circuite tout via le `Gate::before` global
 * (`AppServiceProvider`), donc aucune méthode ne le teste.
 *
 * Aucune capacité `roles.view` n'existe au catalogue : la lecture est gardée
 * par `team.assign_role`, qui est exactement la raison métier de consulter
 * la liste des rôles (les assigner). Ajouter un 45ᵉ cas à l'enum pour ça
 * serait un élargissement de périmètre.
 */
class AgencyRolePolicy
{
    public function viewAny(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::TeamAssignRole, $agency);
    }

    public function view(User $user, AgencyRole $role): bool
    {
        $agency = $role->agency;

        return $agency !== null && $user->canActAt(Capability::TeamAssignRole, $agency);
    }

    public function create(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::RolesCreateCustom, $agency);
    }

    /**
     * Un rôle système n'est **jamais** éditable, quelle que soit la capacité
     * du demandeur (spec §52). L'UI propose un clone à la place.
     */
    public function update(User $user, AgencyRole $role): bool
    {
        if ($role->is_system) {
            return false;
        }

        $agency = $role->agency;

        return $agency !== null && $user->canActAt(Capability::RolesEditCustom, $agency);
    }

    public function delete(User $user, AgencyRole $role): bool
    {
        if ($role->is_system) {
            return false;
        }

        $agency = $role->agency;

        return $agency !== null && $user->canActAt(Capability::RolesDeleteCustom, $agency);
    }

    /**
     * Remplacement en bloc des capacités d'un rôle — même garde que
     * l'édition : c'est la même mutation, sur une autre table.
     */
    public function syncCapabilities(User $user, AgencyRole $role): bool
    {
        return $this->update($user, $role);
    }

    /**
     * Réaffectation d'un profil à un autre rôle. C'est un acte d'équipe, pas
     * d'édition de rôle : `team.assign_role`.
     */
    public function assign(User $user, Agency $agency): bool
    {
        return $user->canActAt(Capability::TeamAssignRole, $agency);
    }
}
