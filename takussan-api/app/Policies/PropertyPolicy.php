<?php

namespace App\Policies;

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
    protected function resource(): string
    {
        return 'properties';
    }

    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Property) {
            return false;
        }

        if ($user->id === $model->user_id) {
            return true;
        }

        if ($user->agency_id !== null && $user->agency_id === $model->agency_id) {
            return true;
        }

        if ($user->hasRole(['admin', 'super_admin'])) {
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
     * TCK-086 — attaching a child under a parent requires update rights on
     * both ends.
     */
    public function updateParent(User $user, Property $child, Property $parent): bool
    {
        return $this->update($user, $child) && $this->update($user, $parent);
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
}
