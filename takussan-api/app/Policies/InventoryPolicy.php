<?php

namespace App\Policies;

use App\Models\Inventory;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `InventoryController::authorizeAccess()` / `authorizeManage()`.
 */
class InventoryPolicy extends BasePolicy
{
    /**
     * Lire un état des lieux : super-admin, celui qui l'a conduit, le propriétaire du bien, le
     * LOCATAIRE, ou le périmètre d'agence du bien.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Inventory) {
            return false;
        }

        $property = $model->property;
        $tenant = $model->tenant;

        return $user->isSuperAdmin()
            || $model->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($tenant && $tenant->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }

    /**
     * Administrer un état des lieux : les mêmes, **sans le locataire**. Un locataire consulte et
     * conteste son état des lieux ; il ne le modifie pas.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Inventory) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->conducted_by === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }
}
