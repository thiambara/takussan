<?php

namespace App\Policies;

use App\Models\Enums\Capability;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `PayoutController::authorizeAccess()` / `authorizeManage()`.
 */
class PayoutPolicy extends BasePolicy
{
    /**
     * TCK-528 — émettre un reversement exige `payouts.create` sur l'agence du profil actif.
     *
     * La capacité n'était accordée qu'à `agency_admin` (par `Capability::agencyAssignable()`) et
     * lue nulle part : `PayoutService::create()` acceptait tout utilisateur ayant une agence.
     */
    protected function createCapability(): ?Capability
    {
        return Capability::PayoutsCreate;
    }

    /** Lire un versement : super-admin, BÉNÉFICIAIRE, émetteur, ou périmètre d'agence. */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Payout) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->landlord_id === $user->id
            || $model->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $model->agency_id);
    }

    /**
     * Administrer un versement : super-admin, émetteur, ou périmètre d'agence.
     *
     * ⚠ **Le bénéficiaire n'est PAS ici.** C'est la seule clause qui sépare les deux règles : un
     * bailleur voit son versement, il ne le marque pas « payé ».
     */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Payout) {
            return false;
        }

        return $user->isSuperAdmin()
            || $model->issued_by_id === $user->id
            || ($user->agency_id && $user->agency_id === $model->agency_id);
    }
}
