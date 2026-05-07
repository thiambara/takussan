<?php

namespace App\Console\Commands\Billing;

use App\Models\BookingPayment;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use Illuminate\Console\Command;

/**
 * TCK-223 — Conservative backfill: existing `paid` payments get
 * `platform_fee_pct_at_payment = 0` so they are emitted at full gross in the
 * first close-period (no retroactive commission). New paid payments stamp
 * the active subscription rate via PaymentPlatformFeeObserver.
 */
class BackfillPlatformFeeAtPaymentCommand extends Command
{
    protected $signature = 'platform:backfill-payment-fees {--dry-run}';

    protected $description = 'Backfill platform_fee_pct_at_payment to 0 for already-paid payments missing the value (no retroactive commission).';

    public function handle(): int
    {
        $bookingCount = BookingPayment::query()
            ->where('status', PaymentStatus::Paid)
            ->whereNull('platform_fee_pct_at_payment')
            ->count();

        $leaseCount = LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->whereNull('platform_fee_pct_at_payment')
            ->count();

        $this->line("Booking payments to backfill: {$bookingCount}");
        $this->line("Lease payments to backfill:   {$leaseCount}");

        if ($this->option('dry-run')) {
            $this->info('Dry run — no rows updated.');

            return self::SUCCESS;
        }

        BookingPayment::query()
            ->where('status', PaymentStatus::Paid)
            ->whereNull('platform_fee_pct_at_payment')
            ->update(['platform_fee_pct_at_payment' => 0]);

        LeasePayment::query()
            ->where('status', PaymentStatus::Paid)
            ->whereNull('platform_fee_pct_at_payment')
            ->update(['platform_fee_pct_at_payment' => 0]);

        $this->info('Backfill complete.');

        return self::SUCCESS;
    }
}
