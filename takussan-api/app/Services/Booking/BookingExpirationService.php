<?php

namespace App\Services\Booking;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Models\User;
use App\Notifications\BookingExpiredNotification;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class BookingExpirationService
{
    public const BATCH_SIZE = 100;

    public const DEFAULT_EXPIRY_HOURS = 48;

    public const LOCK_KEY = 'expire-bookings';

    public const LOCK_TTL_SECONDS = 600;

    /**
     * Get the expiry threshold in hours for a given agency.
     * Returns 0 if auto-expiration is disabled.
     */
    public function getExpiryThresholdHours(Agency $agency): int
    {
        $settings = $agency->settings ?? [];
        $hours = $settings['booking_pending_expiry_hours'] ?? self::DEFAULT_EXPIRY_HOURS;

        // Validate range: 0 means disabled, otherwise 1-168
        if ($hours === 0 || $hours === '0') {
            return 0;
        }

        $hours = (int) $hours;
        if ($hours < 0) {
            return self::DEFAULT_EXPIRY_HOURS;
        }

        return min(max($hours, 1), 168);
    }

    /**
     * Check if auto-expiration is enabled for the agency.
     */
    public function isAutoExpirationEnabled(Agency $agency): bool
    {
        return $this->getExpiryThresholdHours($agency) > 0;
    }

    /**
     * TCK-575 — l'instant à partir duquel une demande EN ATTENTE expire faute de réponse, ou
     * `null` si rien ne la fera expirer (ou si elle n'est plus en attente).
     *
     * Deux mécanismes expirent une demande, et c'est le PREMIER échu qui s'applique :
     *
     * - le seuil de l'agence (`booking_pending_expiry_hours`, 48 h par défaut, 0 = désactivé),
     *   compté depuis `created_at` — `ExpirePendingBookingsJob`, toutes les 15 minutes ;
     * - l'échéance propre de la demande, `expires_at` (7 jours par défaut dans
     *   `BookingService::create`) — `ExpireBookings`, toutes les heures.
     *
     * Le front l'affiche à la confirmation d'une demande, au lieu du « sous 48h » écrit en dur qui
     * ignorait le réglage de l'agence. Mesuré le 2026-09-24 : `expires_at` seul rendait 7 jours
     * pour une agence au seuil de 48 h — il ne pouvait pas servir tel quel.
     */
    public function responseDeadline(Booking $booking): ?CarbonInterface
    {
        if ($booking->status !== BookingStatus::Pending || $booking->expired_at !== null) {
            return null;
        }

        $echeances = [];
        if ($booking->expires_at !== null) {
            $echeances[] = CarbonImmutable::instance($booking->expires_at);
        }

        $agency = $booking->agency_id !== null ? $booking->agency : null;
        if ($agency !== null && $booking->created_at !== null) {
            $heures = $this->getExpiryThresholdHours($agency);
            if ($heures > 0) {
                $echeances[] = CarbonImmutable::instance($booking->created_at)->addHours($heures);
            }
        }

        return $echeances === [] ? null : min($echeances);
    }

    /**
     * Expire pending bookings that have passed the threshold.
     * Returns array with count of expired bookings and any errors.
     *
     * @return array{expired_count: int, errors: array<string>}
     */
    public function expirePendingBookings(): array
    {
        $lock = Cache::lock(self::LOCK_KEY, self::LOCK_TTL_SECONDS);

        if (! $lock->get()) {
            Log::info('BookingExpirationService: Could not acquire lock, another instance is running');

            return ['expired_count' => 0, 'errors' => ['Could not acquire lock']];
        }

        try {
            $expiredCount = 0;
            $errors = [];
            $remaining = self::BATCH_SIZE;

            foreach (Agency::cursor() as $agency) {
                if ($remaining <= 0) {
                    break;
                }

                if (! $this->isAutoExpirationEnabled($agency)) {
                    continue;
                }

                $cutoffTime = now()->subHours($this->getExpiryThresholdHours($agency));
                $bookings = $this->getEligibleBookings($agency, $cutoffTime, $remaining);

                foreach ($bookings as $booking) {
                    try {
                        $this->expireBooking($booking);
                        $expiredCount++;
                        $remaining--;
                    } catch (\Exception $e) {
                        $errors[] = "Failed to expire booking {$booking->id}: {$e->getMessage()}";
                        Log::error('Booking expiration failed', ['booking_id' => $booking->id, 'error' => $e->getMessage()]);
                    }
                }
            }

            return ['expired_count' => $expiredCount, 'errors' => $errors];
        } finally {
            $lock->release();
        }
    }

    /**
     * Expire a single booking manually (admin action). Returns true on
     * success, false if the booking is no longer in an expirable state
     * (e.g. raced to confirmed/cancelled/expired between controller check
     * and service call).
     */
    public function expireBookingManually(Booking $booking, ?int $userId = null): bool
    {
        return DB::transaction(function () use ($booking, $userId) {
            $booking->refresh();

            if (! $this->canBeExpired($booking)) {
                return false;
            }

            $booking->update([
                'status' => BookingStatus::Expired,
                'expired_at' => now(),
                'expiry_reason' => 'manual',
            ]);

            $this->logExpiration($booking, 'manual', $userId);
            $this->sendNotifications($booking);

            return true;
        });
    }

    /**
     * Get eligible bookings for expiration (pending, created before cutoff, not already expired).
     */
    private function getEligibleBookings(Agency $agency, \DateTimeInterface $cutoffTime, int $limit): Collection
    {
        return Booking::with(['customer.user', 'property.owner', 'agency.primaryAdmin', 'createdBy'])
            ->where('agency_id', $agency->id)
            ->where('status', BookingStatus::Pending)
            ->where('created_at', '<', $cutoffTime)
            ->whereNull('expired_at')
            ->limit($limit)
            ->get();
    }

    /**
     * Check if a booking can be expired.
     */
    public function canBeExpired(Booking $booking): bool
    {
        return $booking->status === BookingStatus::Pending
            && $booking->expired_at === null;
    }

    /**
     * Expire a single booking (auto).
     */
    private function expireBooking(Booking $booking): void
    {
        if (! $this->canBeExpired($booking)) {
            return;
        }

        DB::transaction(function () use ($booking) {
            $booking->update([
                'status' => BookingStatus::Expired,
                'expired_at' => now(),
                'expiry_reason' => 'auto',
            ]);

            $this->logExpiration($booking, 'auto');
            $this->sendNotifications($booking);
        });
    }

    /**
     * Log the expiration to ActivityLog.
     */
    private function logExpiration(Booking $booking, string $reason, ?int $userId = null): void
    {
        activity()
            ->performedOn($booking)
            ->causedBy($userId ? User::find($userId) : null)
            ->withProperties([
                'booking_id' => $booking->id,
                'reason' => $reason,
                'previous_status' => BookingStatus::Pending->value,
                'new_status' => BookingStatus::Expired->value,
            ])
            ->log('booking_expired');
    }

    /**
     * Send notifications to tenant and agent.
     */
    private function sendNotifications(Booking $booking): void
    {
        // Notify tenant (customer) - in-app + email
        if ($booking->customer && $booking->customer->user) {
            $booking->customer->user->notify(new BookingExpiredNotification($booking, 'tenant'));
        }

        // Notify agent - in-app only
        $agent = $this->resolveAgent($booking);
        if ($agent) {
            $agent->notify(new BookingExpiredNotification($booking, 'agent'));
        }
    }

    /**
     * Resolve the agent to notify for this booking.
     */
    private function resolveAgent(Booking $booking): ?User
    {
        // First try the property's owner
        if ($booking->property && $booking->property->owner) {
            return $booking->property->owner;
        }

        // Fall back to the booking creator if they have an active agent
        // profile in the booking's agency (TCK-278 — rôle = profil).
        $bookingAgencyId = $booking->agency_id
            ?? $booking->property?->agency_id;
        if ($booking->createdBy
            && $bookingAgencyId !== null
            && $booking->createdBy->isAgentAt((int) $bookingAgencyId)) {
            return $booking->createdBy;
        }

        // Finally, try the agency's primary admin
        if ($booking->agency && $booking->agency->primaryAdmin) {
            return $booking->agency->primaryAdmin;
        }

        return null;
    }
}
