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
    /** Personnel de l'agence du bail, bailleur, ou locataire. */
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

        // TCK-587 — le personnel de l'agence du bail (ADR-0031), le bailleur s'il n'y est pas
        // suspendu (m3), ou le locataire.
        return $this->isStaffOf($user, $lease->agency_id)
            || $this->landlordWrites($user, $lease->landlord_id, $lease->agency_id)
            || ($lease->tenant?->user_id === $user->id);
    }
}
