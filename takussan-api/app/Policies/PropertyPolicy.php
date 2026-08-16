<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-074 — authorization for custom property actions (duplicate,
 * bulk-archive). Standard CRUD remains handled inline in
 * `PropertyController` via `authorizeAccess` / `authorizeManage`.
 *
 * The `super_admin` bypass is already wired globally via Gate::before.
 */
class PropertyPolicy extends BasePolicy
{
    /**
     * TCK-297 — `properties.create` et `properties.delete` existent dans
     * `Capability` et fonctionnaient ; ils sont désormais DÉSIGNÉS au lieu
     * d'être reconstruits par concaténation.
     *
     * Il n'y a délibérément ni capacité de lecture (`properties.view`
     * n'existe pas — la lecture passe par le périmètre d'agence) ni capacité
     * de mise à jour générique : l'enum sépare `update_any` et `update_own`,
     * et c'est `update()` ci-dessous qui porte cette distinction en dur
     * (propriétaire, puis agence).
     */
    protected function createCapability(): ?Capability
    {
        return Capability::PropertiesCreate;
    }

    protected function deleteCapability(): ?Capability
    {
        return Capability::PropertiesDelete;
    }

    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Property) {
            return false;
        }

        if ($user->id === $model->user_id) {
            return true;
        }

        // `$user->agency_id` is the active-profile-aware accessor (TCK-146):
        // returns the active profile's agency in HTTP, auto-bascules for
        // single-profile users in jobs / console, and is null for
        // multi-profile users without an explicit context. The strict
        // equality below is therefore safe across all contexts.
        if ($user->agency_id !== null && $user->agency_id === $model->agency_id) {
            return true;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return false;
    }

    /**
     * Duplicate requires update rights on the source property.
     */
    public function duplicate(User $user, Property $property): bool
    {
        return $this->update($user, $property);
    }

    /**
     * Bulk-archive is granted when the user is authenticated; per-property
     * authorization is delegated to the service which evaluates each id
     * through the `update` policy.
     */
    public function bulkArchive(User $user): bool
    {
        return $user !== null;
    }

    /**
     * TCK-086 — re-parenting requires update rights on the child AND on the
     * candidate parent (when one is provided). Detaching to root only needs
     * update rights on the child.
     */
    public function updateParent(User $user, Property $child, ?Property $newParent = null): bool
    {
        if (! $this->update($user, $child)) {
            return false;
        }

        if ($newParent === null) {
            return true;
        }

        return $this->update($user, $newParent);
    }
}
