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
use Database\Seeders\Support\StatusDistribution;
use Database\Seeders\Support\Timeline;
use Database\Seeders\Support\Tirage;
use Illuminate\Database\Seeder;

class LeasePaymentSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->leases as $lease) {
            if ($lease->status === LeaseStatus::Draft) {
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
        // TCK-2377 — un bail résilié pour impayés l'est après ses deux derniers loyers restés dus.
        $impayesFinaux = $lease->termination_reason === LeaseSeeder::MOTIF_IMPAYES
            ? $lastMonth->subMonthsNoOverflow(1)
            : null;

        // La caution se verse à la signature du premier bail ; un renouvellement la reprend.
        if ($lease->renewed_from_lease_id === null) {
            $this->caution($lease, $start);
        }

        while ($cursor->lessThanOrEqualTo($lastMonth)) {
            $due = $cursor->day(min($payDay, $cursor->daysInMonth));

            [$status, $paidAt, $lateFee] = match (true) {
                $due->greaterThan($now) => [PaymentStatus::Pending->value, null, null],
                $impayesFinaux !== null && $cursor->greaterThanOrEqualTo($impayesFinaux) => [PaymentStatus::Late->value, null, $this->penalite($lease)],
                default => $this->issueDUneEcheance($lease, $due, $now),
            };

            LeasePayment::create([
                'lease_id' => $lease->id,
                'payer_id' => $lease->tenant_id,
                'reference_number' => 'LPY-'.strtoupper(Tirage::code(6)),
                'amount' => $lease->monthly_rent,
                'currency' => 'XOF',
                // TCK-2380 — tous les loyers passaient par Wave : le mobile money domine, le virement et
                // les espèces gardent leur part.
                'payment_method' => StatusDistribution::pick([
                    PaymentMethod::Wave->value => 45,
                    PaymentMethod::OrangeMoney->value => 25,
                    PaymentMethod::BankTransfer->value => 15,
                    PaymentMethod::Cash->value => 10,
                    PaymentMethod::FreeMoney->value => 5,
                ]),
                'payment_type' => LeasePaymentType::Rent->value,
                'period_start' => $cursor->toDateString(),
                'period_end' => $cursor->endOfMonth()->toDateString(),
                'due_date' => $due->toDateString(),
                'paid_at' => $paidAt,
                'status' => $status,
                'late_fee_amount' => $lateFee,
                'late_fee_applied_at' => $lateFee > 0 ? $due->addDays(10) : null,
                'transaction_id' => $paidAt ? 'TX-'.strtoupper(Tirage::code(10)) : null,
                'created_at' => $cursor,
                'updated_at' => $paidAt ?? $due,
            ]);

            $cursor = $cursor->addMonth();
        }
    }

    /**
     * Ce qu'est devenue une échéance passée. Un retard récent peut encore être dû ; un retard de plus
     * de deux mois a été régularisé, pénalité comprise — avant TCK-2377, 273 impayés restaient
     * ouverts quelle que soit leur ancienneté, sans relance ni résiliation.
     *
     * @return array{0: string, 1: ?CarbonImmutable, 2: ?int} statut, date de paiement, pénalité
     */
    private function issueDUneEcheance(Lease $lease, CarbonImmutable $due, CarbonImmutable $now): array
    {
        $roll = mt_rand(1, 100);
        $recente = $due->greaterThan($now->subDays(60));

        return match (true) {
            $roll <= 72 => [PaymentStatus::Paid->value, $due->addDays(mt_rand(0, 5)), null],
            $roll <= 92 || ! $recente => [PaymentStatus::Paid->value, $this->paiementTardif($due, $now), $this->penalite($lease)],
            default => [PaymentStatus::Late->value, null, $this->penalite($lease)],
        };
    }

    private function paiementTardif(CarbonImmutable $due, CarbonImmutable $now): CarbonImmutable
    {
        $paidAt = $due->addDays(mt_rand(10, 50));

        return $paidAt->greaterThan($now) ? $now->subDay() : $paidAt;
    }

    private function penalite(Lease $lease): int
    {
        return (int) round((float) $lease->monthly_rent * 0.05);
    }

    private function caution(Lease $lease, CarbonImmutable $start): void
    {
        LeasePayment::create([
            'lease_id' => $lease->id,
            'payer_id' => $lease->tenant_id,
            'reference_number' => 'LPY-'.strtoupper(Tirage::code(6)),
            'amount' => $lease->deposit_amount ?: $lease->monthly_rent,
            'currency' => 'XOF',
            // TCK-2380 — une caution se verse par virement ou en espèces à l'agence, parfois par Wave.
            'payment_method' => StatusDistribution::pick([
                PaymentMethod::BankTransfer->value => 50,
                PaymentMethod::Cash->value => 30,
                PaymentMethod::Wave->value => 20,
            ]),
            'payment_type' => LeasePaymentType::Deposit->value,
            'period_start' => $start->toDateString(),
            'period_end' => $start->toDateString(),
            'due_date' => $start->toDateString(),
            'paid_at' => $start,
            'status' => PaymentStatus::Paid->value,
            'created_at' => $start,
            'updated_at' => $start,
        ]);
    }
}
