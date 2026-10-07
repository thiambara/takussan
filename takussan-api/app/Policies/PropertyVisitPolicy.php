<?php

namespace App\Policies;

use App\Models\PropertyVisit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `PropertyVisitController::authorizeAccess()` / `authorizeManage()`.
 *
 * TCK-587 (ADR-0031) — le « périmètre d'agence » est le PERSONNEL de l'agence du bien : la clause
 * comparait `$user->agency_id`, vraie pour un autre bailleur de l'agence.
 */
class PropertyVisitPolicy extends BasePolicy
{
    /**
     * Lire une visite : super-admin, VISITEUR, agent, propriétaire du bien, périmètre d'agence,
     * ou le CLIENT rattaché.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->visitor_id === $user->id
            || $model->agent_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($property && $this->isStaffOf($user, $property->agency_id))
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /**
     * Administrer une visite : les mêmes, **sans le visiteur ni le client**. Un visiteur annule
     * sa visite par l'endpoint dédié, qui passe par `view`.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof PropertyVisit) {
            return false;
        }

        $property = $model->property;

        // TCK-587 (ADR-0031 §2, passe 2 N2) — le propriétaire suspendu dans l'agence du bien ne
        // déplace ni n'annule plus la visite.
        return $user->isSuperAdmin()
            || $model->agent_id === $user->id
            || ($property && $this->landlordWrites($user, $property->user_id, $property->agency_id))
            || ($property && $this->isStaffOf($user, $property->agency_id));
    }
}
