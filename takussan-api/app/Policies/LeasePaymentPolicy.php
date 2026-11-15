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
        // suspendu (m3), ou le locataire. TCK-2183 (P217.04) — le bailleur au sens de
        // `BailleurDuBien` (`bailleurEcrit`, TCK-1722) : l'agent recopié en `landlord_id` passe par
        // la branche du personnel, et la perd suspendu ou retiré.
        return $this->isStaffOf($user, $lease->agency_id)
            || $this->bailleurEcrit($user, $lease->landlord_id, $lease->agency_id)
            || ($lease->tenant?->user_id === $user->id);
    }

    /**
     * TCK-2658 (ADR-0105 § 2) — noter une relance de l'échéance, et lire ses relances : la branche
     * du PERSONNEL de `update` seule. « L'agence note qu'elle a relancé » : le locataire et le
     * bailleur, que `update` admet pour payer, ne relancent pas. Un bail sans agence n'a personne
     * pour le relancer ici.
     */
    public function remind(User $user, Model $model): bool
    {
        if (! $model instanceof LeasePayment) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        return $this->isStaffOf($user, $model->lease?->agency_id);
    }
}
