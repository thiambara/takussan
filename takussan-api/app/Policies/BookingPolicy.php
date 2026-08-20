<?php

namespace App\Policies;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * TCK-306 — reprise EXACTE de `BookingController::authorizeAccess()` / `authorizeManage()`.
 *
 * Le `super_admin` est court-circuité globalement par `Gate::before` (`AppServiceProvider`) ; la
 * clause est conservée telle quelle dans chaque méthode pour que la policy reste juste lorsqu'elle
 * est appelée directement, hors de la Gate.
 */
class BookingPolicy extends BasePolicy
{
    /**
     * Lire une réservation : super-admin, celui qui l'a créée, le propriétaire du bien, le
     * périmètre d'agence, ou le CLIENT rattaché.
     *
     * ⚠ Deux clauses sont ici et **pas** dans `update()` : le créateur et le client. Un client
     * consulte sa réservation, il ne l'administre pas.
     */
    public function view(User $user, Model $model): bool
    {
        if (! $model instanceof Booking) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || $model->created_by_id === $user->id
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $model->agency_id)
            || ($model->customer && $model->customer->user_id === $user->id);
    }

    /** Administrer une réservation : super-admin, propriétaire du bien, ou périmètre d'agence. */
    public function update(User $user, Model $model): bool
    {
        if (! $model instanceof Booking) {
            return false;
        }

        $property = $model->property;

        return $user->isSuperAdmin()
            || ($property && $property->user_id === $user->id)
            || ($user->agency_id && $user->agency_id === $model->agency_id);
    }
}
