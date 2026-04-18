<?php

namespace App\Jobs;

use App\Models\Booking;
use App\Models\Enums\BookingStatus;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ExpireBookings implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        Booking::where('status', BookingStatus::Pending)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->update(['status' => BookingStatus::Expired]);
    }
}
