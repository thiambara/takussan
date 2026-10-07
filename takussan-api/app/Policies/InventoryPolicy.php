<?php

namespace App\Policies;

use App\Models\Inventory;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `InventoryController::authorizeAccess()` / `authorizeManage()`.
 *
 * TCK-587 (ADR-0031) — le « périmètre d'agence » est le PERSONNEL de l'agence du bien : la clause
 * comparait `$user->agency_id`, vraie pour un autre bailleur de l'agence.
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
            || ($property && $this->isStaffOf($user, $property->agency_id));
    }

    /**
     * Administrer un état des lieux : les mêmes, **sans le locataire**. Un locataire consulte et
     * conteste son état des lieux ; il ne le modifie pas.
     *
     * TCK-587 (ADR-0031 §2, passe 2 N2) — un bailleur suspendu dans l'agence du bien le lit encore,
     * il ne le modifie plus.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Inventory) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $this->landlordWrites($user, $model->conducted_by, $property?->agency_id)
            || ($property && $this->landlordWrites($user, $property->user_id, $property->agency_id))
            || ($property && $this->isStaffOf($user, $property->agency_id));
    }
}
