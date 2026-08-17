<?php

namespace App\Policies;

use App\Models\BookingPayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise de la branche `BookingPayment` de
 * `PaymentGatewayController::authorizeManage()`, un `instanceof` polymorphe sur trois types.
 *
 * Le test polymorphe devient trois policies, une par modèle : c'est Laravel qui choisit celle qui
 * s'applique, sur la classe réelle. La chaîne de `elseif` faisait le même travail à la main, et
 * son `$ok = false` initial rendait tout type non prévu refusé — comportement conservé, une
 * ability sans policy refuse.
 */
class BookingPaymentPolicy extends BasePolicy
{
    /** Périmètre d'agence de la réservation, propriétaire du bien, ou client. */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof BookingPayment) {
            return false;
        }

        if ($user->isSuperAdmin()) {
            return true;
        }

        $booking = $model->booking;

        if ($booking === null) {
            return false;
        }

        return ($user->agency_id && $user->agency_id === $booking->agency_id)
            || ($booking->property?->user_id === $user->id)
            || ($booking->customer?->user_id === $user->id);
    }
}
