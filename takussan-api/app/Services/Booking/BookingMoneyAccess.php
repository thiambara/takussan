<?php

namespace App\Services\Booking;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\Capability;
use App\Models\User;
use App\Services\Membership\MembershipCapabilityResolver;

/**
 * TCK-596 — qui touche à l'argent d'une réservation : l'enregistrement d'un paiement
 * (`POST bookings/{id}/payments`) et son remboursement (`POST booking-payments/{id}/refund`).
 *
 * Trois voies, et le client n'en est aucune pour le remboursement :
 *
 *   - le **bailleur direct** du bien (`properties.user_id`), sauf s'il est suspendu dans l'agence
 *     du bien : il reste partie, il perd les écritures (ADR-0031 §2) ;
 *   - le **personnel de l'agence de la réservation** (prédicat TCK-587 `isStaffAt`, jamais
 *     `users.agency_id`) — pour rembourser, titulaire de `bookings.refund` dans CETTE agence ;
 *   - le super-admin.
 *
 * Ni un autre bailleur de l'agence : `canManageBooking` acceptait « même agence », et l'accesseur
 * `agency_id` rend l'agence d'un `OwnerProfile` ; `store` comptait `isOwnerAt(agence)` comme du
 * personnel. Il enregistrait un acompte `paid` sur la réservation d'un autre bailleur.
 */
final class BookingMoneyAccess
{
    public static function isDirectLandlord(User $user, Booking $booking): bool
    {
        $property = $booking->property;
        if ($property === null || $property->user_id === null || (int) $property->user_id !== (int) $user->id) {
            return false;
        }

        $agencyId = self::agencyId($booking);

        return $agencyId === null || ! $user->isBlockedOwnerAt($agencyId);
    }

    public static function isStaff(User $user, Booking $booking): bool
    {
        $agencyId = self::agencyId($booking);

        return $agencyId !== null && app(MembershipCapabilityResolver::class)->isStaffAt($user, $agencyId);
    }

    /**
     * La capacité est jugée par le résolveur, pour l'agence de la réservation, et non par
     * `$user->can()` : `Gate::before` l'accorderait à tout super-admin, et l'agence active d'un
     * membre de plusieurs agences n'est pas forcément celle de la réservation.
     */
    public static function canRefund(User $user, Booking $booking): bool
    {
        if ($user->isSuperAdmin() || self::isDirectLandlord($user, $booking)) {
            return true;
        }

        if (! self::isStaff($user, $booking)) {
            return false;
        }

        $agency = Agency::query()->find(self::agencyId($booking));

        return $agency !== null && $user->canActAt(Capability::BookingsRefund, $agency);
    }

    /** Peut enregistrer un paiement tel quel (`paid` compris) : jamais le client seul. */
    public static function canRecordAsCollector(User $user, Booking $booking): bool
    {
        return $user->isSuperAdmin() || self::isDirectLandlord($user, $booking) || self::isStaff($user, $booking);
    }

    private static function agencyId(Booking $booking): ?int
    {
        $id = $booking->agency_id ?? $booking->property?->agency_id;

        return $id !== null ? (int) $id : null;
    }
}
