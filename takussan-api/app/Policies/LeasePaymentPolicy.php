<?php

namespace App\Policies;

use App\Models\LeasePayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise de la branche `LeasePayment` de
 * `PaymentGatewayController::authorizeManage()`.
 */
class LeasePaymentPolicy extends BasePolicy
{
    /** Périmètre d'agence du bail, bailleur, ou locataire. */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof LeasePayment) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        $lease = $model->lease;

        if ($lease === null) {
            return false;
        }

        return ($user->agency_id && $user->agency_id === $lease->agency_id)
            || $lease->landlord_id === $user->id
            || ($lease->tenant?->user_id === $user->id);
    }
}
