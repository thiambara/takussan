<?php

namespace App\Jobs\Booking;

use App\Services\Booking\BookingExpirationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class ExpirePendingBookingsJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * The number of times the job may be attempted.
     */
    public $tries = 3;

    /**
     * The number of seconds the job can run before timing out.
     */
    public $timeout = 300;

    /**
     * Execute the job.
     */
    public function handle(BookingExpirationService $service): void
    {
        Log::info('ExpirePendingBookingsJob: Starting expiration sweep');

        $result = $service->expirePendingBookings();

        Log::info('ExpirePendingBookingsJob: Completed', [
            'expired_count' => $result['expired_count'],
            'errors' => count($result['errors']),
        ]);

        if (! empty($result['errors'])) {
            foreach ($result['errors'] as $error) {
                Log::warning('ExpirePendingBookingsJob: Error during expiration', ['error' => $error]);
            }
        }
    }

    /**
     * Handle a job failure.
     */
    public function failed(\Throwable $exception): void
    {
        Log::error('ExpirePendingBookingsJob: Job failed', [
            'exception' => $exception->getMessage(),
            'trace' => $exception->getTraceAsString(),
        ]);
    }
}
