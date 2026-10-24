<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\PlatformPayout;
use App\Services\Dashboard\PortfolioMetrics;
use App\Services\Dashboard\PortfolioScope;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Support\EncaissementsPlateforme;
use Tests\TestCase;

/**
 * P206.02 (ADR-0057, amendement du 2026-10-24, points 1 et 2) — l'*Encaissé* compte la pénalité de
 * retard réglée, datée par `late_fee_paid_at` ; ses frais plateforme ne portent que sur la pénalité
 * réglée par le checkout de la plateforme, lue par la méthode de la clôture.
 *
 * Avant : deux loyers de 150 000 et 100 000, dont le premier réglé avec 7 500 de pénalité,
 * donnaient un Encaissé de 250 000.
 */
class PenaliteDeRetardEncaisseeTest extends TestCase
{
    use EncaissementsPlateforme;
    use RefreshDatabase;

    private Agency $agency;

    private Lease $lease;

    protected function setUp(): void
    {
        parent::setUp();
        $this->agency = Agency::factory()->create(['is_verified' => true, 'currency' => Currency::XOF]);
        $this->lease = Lease::factory()->create(['agency_id' => $this->agency->id, 'currency' => Currency::XOF]);
    }

    private function rent(float $amount, string $paidAt = '2026-09-10 10:00:00', float $lateFee = 0, ?string $lateFeePaidAt = null): LeasePayment
    {
        return LeasePayment::factory()->create([
            'lease_id' => $this->lease->id,
            'amount' => $amount,
            'currency' => Currency::XOF,
            'status' => PaymentStatus::Paid,
            'paid_at' => $paidAt,
            'platform_fee_pct_at_payment' => 5,
            'late_fee_amount' => $lateFee ?: null,
            'late_fee_paid_at' => $lateFeePaidAt,
        ]);
    }

    /** @return array{gmv: float, fees: float} */
    private function september(): array
    {
        return app(PlatformMetricsSnapshotter::class)->flowsBetween(Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30 23:59:59'));
    }

    public function test_a_late_fee_settled_at_the_agency_is_collected_without_platform_fees(): void
    {
        $this->rent(150_000, lateFee: 7_500, lateFeePaidAt: '2026-09-12 10:00:00');
        $this->rent(100_000);

        $this->assertEquals(['gmv' => 257_500.0, 'fees' => 12_500.0], $this->september());

        $byMonth = app(PortfolioMetrics::class)->leaseIncomeByMonth(PortfolioScope::agency((int) $this->agency->id), Carbon::parse('2026-09-01'), Carbon::parse('2026-09-30'));
        $this->assertEquals(257_500, $byMonth['2026-09']);
    }

    public function test_the_late_fee_is_dated_by_its_settlement_not_by_its_rent(): void
    {
        $this->rent(150_000, '2026-08-28 10:00:00', 7_500, '2026-09-03 10:00:00');

        $this->assertEquals(7_500.0, $this->september()['gmv']);
        $august = app(PlatformMetricsSnapshotter::class)->flowsBetween(Carbon::parse('2026-08-01'), Carbon::parse('2026-08-31 23:59:59'));
        $this->assertEquals(150_000.0, $august['gmv']);
    }

    public function test_an_unsettled_late_fee_is_not_collected(): void
    {
        $this->rent(150_000, lateFee: 7_500);

        $this->assertEquals(150_000.0, $this->september()['gmv']);
    }

    public function test_a_late_fee_settled_by_the_platform_checkout_bears_the_closings_fee(): void
    {
        $rent = $this->soldeParLaPlateforme($this->rent(150_000, '2026-09-15 10:00:00', 7_500, '2026-09-15 10:00:00'), 7_500);

        // 150 000 × 5 % + 7 500 × 5 % = 7 500 + 375.
        $this->assertEquals(['gmv' => 157_500.0, 'fees' => 7_875.0], $this->september());

        $this->actingAsRole('super_admin');
        $this->postJson('/api/admin/payouts/close-period', ['agency_id' => $this->agency->id, 'period_end' => '2026-09-30'])->assertCreated();
        $closing = PlatformPayout::query()->where('agency_id', $this->agency->id)->firstOrFail();
        $this->assertSame($closing->id, (int) $rent->fresh()->platform_payout_id);
        $this->assertEquals(375, (float) ($closing->metadata['late_fees_fee'] ?? 0));
    }

    public function test_agency_health_counts_the_settled_late_fee_in_its_revenue(): void
    {
        $this->travelTo(Carbon::parse('2026-09-20 12:00:00'));
        $this->rent(150_000, lateFee: 7_500, lateFeePaidAt: '2026-09-12 10:00:00');
        $this->actingAsRole('super_admin');

        $this->getJson("/api/admin/agencies/{$this->agency->id}/health")
            ->assertOk()
            ->assertJsonPath('data.transactions_30d', 1)
            ->assertJsonPath('data.revenue_30d', 157500);
    }
}
