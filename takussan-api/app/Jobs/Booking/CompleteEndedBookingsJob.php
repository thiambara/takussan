<?php

namespace App\Jobs\Booking;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;

/**
 * TCK-1301 (P115.01, décision du porteur) — tâche quotidienne : une réservation `confirmed` dont la
 * date de fin est passée (la veille au plus tard) passe `completed`, tracé dans `activity_log`
 * (`booking_completed`, acteur nul). Avant, rien n'écrivait `completed` : le séjour mené restait
 * `confirmed`, donc annulable, et son annulation ouvrait une tâche de remboursement de l'acompte.
 *
 * Un séjour mené n'est pas une fermeture : ni `BookingClosed`, ni notification, ni tâche. Les
 * lecteurs de `completed` l'acceptent déjà : occupation (`PortfolioMetrics`), droit de noter le
 * bien (`ReviewEligibility`), refus d'annuler (`BookingService::TERMINAL_CANCEL_STATUSES`).
 *
 * Idempotente : la sélection ne lit que des réservations `confirmed`, et chacune est rejugée sous
 * son verrou avant d'être écrite.
 */
class CompleteEndedBookingsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): int
    {
        $today = now()->toDateString();
        $completed = 0;

        $this->candidates($today)
            ->select('id')
            ->chunkById(100, function ($chunk) use ($today, &$completed) {
                foreach ($chunk as $booking) {
                    if ($this->complete($booking->id, $today)) {
                        $completed++;
                    }
                }
            });

        return $completed;
    }

    /** @return Builder<Booking> */
    private function candidates(string $today): Builder
    {
        return Booking::query()
            ->where('status', BookingStatus::Confirmed->value)
            ->whereNotNull('end_date')
            ->where('end_date', '<', $today);
    }

    private function complete(int $bookingId, string $today): bool
    {
        return DB::transaction(function () use ($bookingId, $today): bool {
            $booking = $this->candidates($today)->whereKey($bookingId)->lockForUpdate()->first();
            if ($booking === null) {
                return false;
            }

            $booking->forceFill(['status' => BookingStatus::Completed])->save();

            activity('Booking')
                ->performedOn($booking)
                ->withProperties(['end_date' => $booking->end_date?->toDateString()])
                ->event('booking_completed')
                ->log('booking_completed');

            return true;
        });
    }
}
