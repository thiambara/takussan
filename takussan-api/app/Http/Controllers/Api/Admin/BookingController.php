<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\ApiError;
use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-101 — Admin endpoints for booking management.
 *
 * Routes require `bookings.cancel` at the booking's agency, or `super_admin` (TCK-1494).
 */
class BookingController extends Controller
{
    public function __construct(private readonly BookingExpirationService $expirationService) {}

    /**
     * POST /api/admin/bookings/{booking}/expire-now
     *
     * Manually expire a pending booking immediately.
     * Requires `bookings.cancel` at the booking's agency (`BookingPolicy::expire`) or super_admin.
     */
    public function expireNow(Request $request, Booking $booking): JsonResponse
    {
        $user = $request->user();

        // TCK-1494 (P116.04) — `bookings.cancel` à l'agence de la réservation (`BookingPolicy::expire`),
        // et non plus le type de profil admin.
        abort_code_unless($user->can('expire', $booking), 403, 'auth.insufficient_privileges');

        // Staff can only expire bookings from the agency they are
        // *currently* acting under. A multi-agency admin must explicitly
        // switch profile to expire bookings from a different tenant.
        if (! $user->isSuperAdmin()) {
            abort_code_unless(
                $booking->agency_id !== null
                    && $request->activeProfile()?->agency_id === $booking->agency_id,
                403,
                'booking.not_in_active_agency',
            );
        }

        // Check if booking can be expired
        if (! $this->expirationService->canBeExpired($booking)) {
            throw (new ApiError(422, 'booking.cannot_expire'))->with([
                'current_status' => $booking->status->value,
                'expired_at' => $this->instant($booking->expired_at),
            ]);
        }

        // Perform the expiration. Returns false if the booking raced to a
        // non-expirable state between the check above and the service call.
        $expired = $this->expirationService->expireBookingManually($booking, $user->id);

        if (! $expired) {
            throw (new ApiError(422, 'booking.expire_race'))->with([
                'current_status' => $booking->fresh()->status->value,
            ]);
        }

        return $this->json([
            'message' => __('messages.booking_expired_manually'),
            'data' => BookingResource::make($booking->fresh())->resolve($request),
        ]);
    }
}
