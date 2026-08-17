<?php

namespace App\Policies;

use App\Models\MaintenanceRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE des cinq helpers de `MaintenanceRequestController` et de
 * `MaintenanceQuoteController` : `authorizeAccess`, `authorizeManage` (défini deux fois, à
 * l'identique, dans les deux contrôleurs), `authorizeAgentOrOwner` et `authorizeProvider`.
 */
class MaintenanceRequestPolicy extends BasePolicy
{
    /**
     * Lire une demande : super-admin, DEMANDEUR, prestataire assigné, propriétaire du bien, ou
     * périmètre d'agence.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof MaintenanceRequest) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->requester_id === $user->id
            || $model->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }

    /**
     * Administrer une demande : les mêmes, **sans le demandeur**. Un locataire qui signale une
     * panne ne décide pas de sa résolution.
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof MaintenanceRequest) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->assigned_to === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }

    /**
     * TCK-306 — reprise de `MaintenanceQuoteController::authorizeAgentOrOwner()` : côté
     * DONNEUR D'ORDRE seulement. Ni le demandeur, ni le prestataire assigné — c'est ce côté-là
     * qui accepte ou refuse un devis.
     */
    public function manageQuotes(User $user, MaintenanceRequest $request): bool
    {
        $property = $request->property;

        return $user->isSuperAdmin()
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $property && $property->agency_id === $user->agency_id);
    }

    /**
     * TCK-306 — reprise de `MaintenanceQuoteController::authorizeProvider()` : le prestataire
     * ASSIGNÉ, et lui seul, soumet un devis. Ni le propriétaire ni l'agence.
     */
    public function actAsProvider(User $user, MaintenanceRequest $request): bool
    {
        return $user->isSuperAdmin() || $request->assigned_to === $user->id;
    }
}
