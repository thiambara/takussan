<?php

namespace App\Policies;

use App\Models\Inventory;
use App\Models\User;
use App\Services\Lecture\InventairesLisibles;
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
     * Lire un état des lieux : la règle de {@see InventairesLisibles}, que la liste applique aussi
     * (TCK-3006, ADR-0138) — le bien supprimé en douceur s'y juge sur son agence.
     */
    public function view(User $user, Model $model): bool
    {
        return $model instanceof Inventory && InventairesLisibles::peut($user, $model);
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
            // P218.04 (TCK-2198) — `landlordWrites` gardé, et le conducteur encore membre.
            || ($this->landlordWrites($user, $model->conducted_by, $property?->agency_id)
                && $this->auteurEncoreMembre($user, $model->conducted_by, $property?->agency_id))
            // TCK-1928 (P190.01) — `bailleurEcrit` : le bailleur non bloqué, jamais l'agent créateur.
            || ($property && $this->bailleurEcrit($user, $property->user_id, $property->agency_id))
            || ($property && $this->isStaffOf($user, $property->agency_id));
    }

    /**
     * TCK-2646 (ADR-0098 §7, amendement de §1.9) — contester un état des lieux : ses DEUX PARTIES
     * seulement, le locataire (le compte du `Customer` de l'état des lieux, `tenant_id`, recopié du
     * bail à la création — celui que `view` reconnaît) et le bailleur du bail (`leases.landlord_id`). Ni le personnel ni celui qui l'a conduit ne contestent l'état des lieux
     * qu'ils ont dressé — sauf le bailleur qui l'a conduit lui-même : il reste partie.
     *
     * ⚠ Le super-admin n'est pas une partie : l'appelant juge cette règle en direct, hors de
     * `Gate::before` (`DisputeInventoryRequest::authorize`).
     */
    public function dispute(User $user, Model $model): bool
    {
        if (! $model instanceof Inventory) {
            return false;
        }

        $tenantUserId = $model->tenant?->user_id;
        $landlordId = $model->lease?->landlord_id;

        return ($tenantUserId !== null && (int) $tenantUserId === (int) $user->id)
            || ($landlordId !== null && (int) $landlordId === (int) $user->id);
    }
}
