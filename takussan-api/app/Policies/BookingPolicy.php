<?php

namespace App\Policies;

use App\Models\Booking;
use App\Models\Enums\Capability;
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
     * personnel de l'agence (TCK-587 : plus tout membre), ou le CLIENT rattaché.
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
            || $this->isStaffOf($user, $model->agency_id)
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
            || $this->isStaffOf($user, $model->agency_id);
    }

    /**
     * TCK-587 — confirmer ou rejeter une réservation : le propriétaire du bien, ou le personnel de
     * l'agence tenant `bookings.validate`. Les deux gestes passaient par `update`, qui n'exigeait
     * aucune capacité : `bookings.validate` n'avait aucun lecteur.
     */
    public function validate(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin() || $this->landlordOf($user, $booking)) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsValidate->value, $booking);
    }

    /**
     * TCK-587 — annuler une réservation : son CLIENT, le propriétaire du bien, ou le personnel de
     * l'agence tenant `bookings.cancel`. `CancelBookingRequest` jugeait par `view` : tout membre de
     * l'agence, bailleur compris, annulait la réservation d'un autre.
     */
    public function cancel(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin()
            || $this->landlordOf($user, $booking)
            || ($booking->customer && $booking->customer->user_id === $user->id)) {
            return true;
        }

        return $this->isStaffOf($user, $booking->agency_id)
            && $user->can(Capability::BookingsCancel->value, $booking);
    }

    /**
     * TCK-596 (VERIF-596, hors diff fermé ici) — le propriétaire du bien confirme, refuse et annule,
     * sauf s'il est suspendu (`blocked`) dans l'agence de la réservation : la règle de 587
     * (`landlordWrites`) que le bail, l'état des lieux et le remboursement appliquaient déjà.
     */
    private function landlordOf(User $user, Booking $booking): bool
    {
        $property = $booking->property;

        return $property !== null
            && $this->landlordWrites($user, $property->user_id, $booking->agency_id ?? $property->agency_id);
    }
}
