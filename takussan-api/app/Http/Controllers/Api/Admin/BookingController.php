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
        abort_unless($user->hasRole(['agency_admin', 'super_admin']), 403, 'Insufficient privileges.');

        // Agency admins can only expire bookings from their own agency
        if ($user->hasRole('agency_admin') && ! $user->hasRole('super_admin')) {
            abort_unless($booking->agency_id === $user->agency_id, 403, 'Booking does not belong to your agency.');
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

        // Perform the expiration
        $this->expirationService->expireBookingManually($booking, $user->id);

        return $this->json([
            'message' => 'Booking has been manually expired.',
            'data' => BookingResource::make($booking->fresh())->toArray($request),
        ]);
    }
}
