<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class LeasePaymentSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->leases as $lease) {
            if (in_array($lease->status, [LeaseStatus::Draft, LeaseStatus::Renewed], true)) {
                continue;
            }

            $this->seedLeasePayments($lease);
        }
    }

    private function seedLeasePayments(Lease $lease): void
    {
        $start = CarbonImmutable::parse($lease->start_date);
        $now = Timeline::seedEnd();

        $lastMonth = $lease->status === LeaseStatus::Terminated && $lease->terminated_at
            ? CarbonImmutable::parse($lease->terminated_at)->startOfMonth()
            : ($now->lessThan(CarbonImmutable::parse($lease->end_date))
                ? $now->startOfMonth()
                : CarbonImmutable::parse($lease->end_date)->startOfMonth());

        $payDay = (int) ($lease->payment_day ?: 5);
        $cursor = $start->startOfMonth();

        // Deposit payment at lease start.
        LeasePayment::create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'reference_number' => 'LPY-'.strtoupper(Str::random(6)),
            'amount' => $lease->deposit_amount ?: $lease->monthly_rent,
            'currency' => 'XOF',
            'payment_method' => PaymentMethod::BankTransfer->value,
            'payment_type' => LeasePaymentType::Deposit->value,
            'period_start' => $start->toDateString(),
            'period_end' => $start->toDateString(),
            'due_date' => $start->toDateString(),
            'paid_at' => $start,
            'status' => PaymentStatus::Paid->value,
            'created_at' => $start,
            'updated_at' => $start,
        ]);

        while ($cursor->lessThanOrEqualTo($lastMonth)) {
            $due = $cursor->day(min($payDay, $cursor->daysInMonth));
            $isFuture = $due->greaterThan($now);

            if ($isFuture) {
                $status = PaymentStatus::Pending->value;
                $paidAt = null;
                $lateFee = null;
            } else {
                // 70% on time, 20% paid late, 10% unpaid/late.
                $roll = random_int(1, 100);
                if ($roll <= 70) {
                    $status = PaymentStatus::Paid->value;
                    $paidAt = $due->addDays(random_int(0, 5));
                    $lateFee = null;
                } elseif ($roll <= 90) {
                    $status = PaymentStatus::Paid->value;
                    $paidAt = $due->addDays(random_int(6, 20));
                    $lateFee = (int) round(($lease->monthly_rent) * 0.05);
                } else {
                    $status = PaymentStatus::Late->value;
                    $paidAt = null;
                    $lateFee = (int) round(($lease->monthly_rent) * 0.05);
                }
            }

            LeasePayment::create([
                'lease_id' => $lease->id,
                'payer_id' => $lease->tenant_id,
                'reference_number' => 'LPY-'.strtoupper(Str::random(6)),
                'amount' => $lease->monthly_rent,
                'currency' => 'XOF',
                'payment_method' => PaymentMethod::Wave->value,
                'payment_type' => LeasePaymentType::Rent->value,
                'period_start' => $cursor->toDateString(),
                'period_end' => $cursor->endOfMonth()->toDateString(),
                'due_date' => $due->toDateString(),
                'paid_at' => $paidAt,
                'status' => $status,
                'late_fee_amount' => $lateFee,
                'late_fee_applied_at' => $lateFee > 0 ? $due : null,
                'transaction_id' => $paidAt ? 'TX-'.strtoupper(Str::random(10)) : null,
                'created_at' => $cursor,
                'updated_at' => $paidAt ?? $due,
            ]);

            $cursor = $cursor->addMonth();
        }
    }
}
