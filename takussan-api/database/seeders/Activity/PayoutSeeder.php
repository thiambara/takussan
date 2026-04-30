<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PayoutSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->leases as $lease) {
            if ($lease->status === LeaseStatus::Draft) {
                continue;
            }
            $this->seedLeasePayouts($lease);
        }
    }

    private function seedLeasePayouts(Lease $lease): void
    {
        // Aggregate paid lease payments by month, generate one payout per bucket.
        $paidPayments = LeasePayment::query()
            ->where('lease_id', $lease->id)
            ->where('status', 'paid')
            ->whereNotNull('paid_at')
            ->get()
            ->groupBy(fn ($p) => CarbonImmutable::parse($p->period_start)->format('Y-m'));

        $commissionRate = (float) ($lease->commission_rate ?? 8.0) / 100;

        foreach ($paidPayments as $bucket => $payments) {
            $gross = (int) $payments->sum('amount');
            if ($gross <= 0) {
                continue;
            }
            $commission = (int) round($gross * $commissionRate);
            $net = $gross - $commission;
            $periodStart = CarbonImmutable::parse($bucket.'-01');
            $processedAt = $periodStart->endOfMonth()->addDays(random_int(1, 5));

            Payout::withoutEvents(function () use (
                $lease, $gross, $commission, $net, $periodStart, $processedAt, $payments
            ) {
                $payout = Payout::create([
                    'lease_id' => $lease->id,
                    'agency_id' => $lease->agency_id,
                    'landlord_id' => $lease->landlord_id,
                    'reference_number' => 'PO-'.strtoupper(Str::random(8)),
                    'status' => PayoutStatus::Completed->value,
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodStart->endOfMonth()->toDateString(),
                    'gross_amount' => $gross,
                    'commission_amount' => $commission,
                    'net_amount' => $net,
                    'currency' => 'XOF',
                    'payment_method' => 'bank_transfer',
                    'transaction_id' => 'PO-TX-'.strtoupper(Str::random(8)),
                    'scheduled_at' => $processedAt->subDays(2),
                    'processed_at' => $processedAt,
                    'created_at' => $processedAt->subDays(3),
                    'updated_at' => $processedAt,
                ]);

                $payout->leasePayments()->attach($payments->pluck('id')->all());
            });
        }
    }
}
