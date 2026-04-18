<?php

namespace App\Jobs;

use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ApplyLatePaymentPenalties implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        LeasePayment::where('status', PaymentStatus::Pending)
            ->whereDate('due_date', '<', now())
            ->update(['status' => PaymentStatus::Late]);
    }
}
