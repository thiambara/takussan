<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\LeaseStatus;
use App\Models\Enums\PayoutStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Payout;
use Carbon\CarbonImmutable;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

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
            // TCK-594 (ADR-0039 §3) — la caution n'est pas reversée au bailleur.
            ->whereIn('payment_type', ['rent', 'charges', 'penalty', 'regularization'])
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
            $processedAt = $periodStart->endOfMonth()->addDays(mt_rand(1, 5));

            $moyen = $this->ctx->moyensDeReversement[(int) $lease->landlord_id] ?? null;
            Payout::withoutEvents(function () use (
                $lease, $gross, $commission, $net, $periodStart, $processedAt, $payments, $moyen
            ) {
                $payout = Payout::create([
                    'lease_id' => $lease->id,
                    'agency_id' => $lease->agency_id,
                    'landlord_id' => $lease->landlord_id,
                    'reference_number' => 'PO-'.strtoupper(Tirage::code(8)),
                    'status' => PayoutStatus::Completed->value,
                    'period_start' => $periodStart->toDateString(),
                    'period_end' => $periodStart->endOfMonth()->toDateString(),
                    'gross_amount' => $gross,
                    'commission_amount' => $commission,
                    'net_amount' => $net,
                    'currency' => 'XOF',
                    // TCK-2379 — la destination déclarée et vérifiée du bailleur (PayoutMethodSeeder), par sa
                    // nature ; un reversement sans destination reste un virement.
                    'payment_method' => $moyen?->kind->value ?? 'bank_transfer',
                    'payout_method_id' => $moyen?->id,
                    'transaction_id' => 'PO-TX-'.strtoupper(Tirage::code(8)),
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
