<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Base\Controller;
use App\Http\Resources\BookingResource;
use App\Models\Booking;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TCK-101 — Admin endpoints for booking management.
 *
 * Routes require `agency_admin` or `super_admin`.
 */
class BookingController extends Controller
{
    public function __construct(private readonly BookingExpirationService $expirationService) {}

    /**
     * POST /api/admin/bookings/{booking}/expire-now
     *
     * Manually expire a pending booking immediately.
     * Requires agency_admin or super_admin role.
     */
    public function expireNow(Request $request, Booking $booking): JsonResponse
    {
        $user = $request->user();

        // Check minimum role requirement: agency_admin or super_admin
        abort_unless($user->isSuperAdmin() || $user->hasRole('agency_admin'), 403, 'Insufficient privileges.');

        // Agency admins can only expire bookings from their own agency.
        // The agency-admin probe is scoped to the active profile's team via
        // ResolveActiveProfile; combined with `isAgentAt`/`isOwnerAt` we
        // verify the user is actually a member of the booking's agency.
        if (! $user->isSuperAdmin()) {
            $belongs = $booking->agency_id !== null
                && ($user->isAgentAt($booking->agency_id) || $user->isOwnerAt($booking->agency_id));
            abort_unless($belongs, 403, 'Booking does not belong to your agency.');
        }

        // Check if booking can be expired
        if (! $this->expirationService->canBeExpired($booking)) {
            return $this->json([
                'message' => 'Booking cannot be expired.',
                'reason' => 'Booking status must be pending and not already expired.',
                'current_status' => $booking->status->value,
                'expired_at' => $booking->expired_at?->toIso8601String(),
            ], 422);
        }

        // Perform the expiration. Returns false if the booking raced to a
        // non-expirable state between the check above and the service call.
        $expired = $this->expirationService->expireBookingManually($booking, $user->id);

        if (! $expired) {
            return $this->json([
                'message' => 'Booking cannot be expired.',
                'reason' => 'Booking status changed before expiration could be applied.',
                'current_status' => $booking->fresh()->status->value,
            ], 422);
        }

        return $this->json([
            'message' => 'Booking has been manually expired.',
            'data' => BookingResource::make($booking->fresh())->toArray($request),
        ]);
    }
}
