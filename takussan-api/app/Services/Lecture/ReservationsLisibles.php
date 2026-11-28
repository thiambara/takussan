<?php

namespace App\Services\Lecture;

use App\Models\Booking;
use App\Models\User;
use App\Policies\BasePolicy;
use App\Services\Membership\MembershipCapabilityResolver;
use App\Services\Property\BailleurDuBien;
use Illuminate\Database\Eloquent\Builder;

/**
 * TCK-3006 (ADR-0138) — qui peut lire une réservation, pour la liste (`GET /api/bookings` et ses
 * compteurs, `GET /api/bookings/counts`) et pour la fiche (`BookingPolicy::view`). Deux faces côte à
 * côte ; `tests/Feature/Lecture/ListeEtFicheParityTest.php` les tient ensemble.
 *
 * Le super-admin lit tout. Sinon :
 *  1. le créateur, tant que la réservation est hors agence ou qu'il est encore membre de son agence
 *     (P218.03, TCK-2196) — le client du tunnel public garde la sienne par la branche 3 ;
 *  2. le bailleur du bien, de tout statut ({@see BailleurDuBien}, TCK-1930 : plus l'agent qui l'a
 *     saisi, jugé au titre du personnel) ;
 *  3. le client rattaché (le compte de la fiche `customer_id`) ;
 *  4. le personnel de l'agence de la réservation, celle de son profil actif (TCK-587).
 */
final class ReservationsLisibles
{
    /**
     * @param  Builder<Booking>  $query
     * @return Builder<Booking>
     */
    public static function restreindre(Builder $query, User $user): Builder
    {
        if ($user->isSuperAdmin()) {
            return $query;
        }

        $memberAgencyIds = app(MembershipCapabilityResolver::class)->memberAgencyIds($user);
        $staffAgencyId = $user->staffAgencyId();
        $agence = $query->qualifyColumn('agency_id');

        return $query->where(function (Builder $q) use ($user, $memberAgencyIds, $staffAgencyId, $agence) {
            // 1.
            $q->where(fn (Builder $a) => $a->where($q->qualifyColumn('created_by_id'), $user->id)
                ->where(fn (Builder $m) => $m->whereNull($agence)->orWhereIn($agence, $memberAgencyIds)))
                // 2.
                ->orWhereHas('property', fn (Builder $p) => BailleurDuBien::restreindre($p, $user))
                // 3.
                ->orWhereHas('customer', fn (Builder $c) => $c->where('user_id', $user->id));
            // 4.
            if ($staffAgencyId !== null) {
                $q->orWhere($agence, $staffAgencyId);
            }
        });
    }

    public static function peut(User $user, Booking $booking): bool
    {
        $property = $booking->property;

        return $user->isSuperAdmin()
            // 1.
            || BasePolicy::auteurEncoreMembre($user, $booking->created_by_id, $booking->agency_id)
            // 2.
            || ($property !== null && BailleurDuBien::est($user, $property->user_id, $property->agency_id))
            // 3.
            || ($booking->customer !== null && (int) $booking->customer->user_id === (int) $user->id)
            // 4.
            || AgenceDuLecteur::personnel($user, $booking->agency_id);
    }
}
