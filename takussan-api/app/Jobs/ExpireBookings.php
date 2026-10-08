<?php

namespace App\Jobs;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use App\Services\Booking\BookingExpirationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

/**
 * Expire les demandes `pending` dont l'échéance propre (`expires_at`) est passée.
 *
 * TCK-596 — par la voie unique de `BookingExpirationService::expire()`, une réservation à la
 * fois : le `update` de masse du seul statut ne posait ni `expired_at` ni `expiry_reason`, ne
 * journalisait rien et ne prévenait personne. Les identifiants sont lus par paquets, et chaque
 * réservation est relue sous verrou par le service.
 */
class ExpireBookings implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public const CHUNK = 100;

    public function handle(?BookingExpirationService $expirations = null): void
    {
        $expirations ??= app(BookingExpirationService::class);

        Booking::query()
            ->where('status', BookingStatus::Pending)
            ->whereNull('expired_at')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->select('id')
            ->chunkById(self::CHUNK, function ($rows) use ($expirations): void {
                foreach (Booking::query()->whereKey($rows->pluck('id'))->get() as $booking) {
                    $expirations->expire($booking, BookingExpirationService::REASON_DEADLINE);
                }
            });
    }
}
