<?php

namespace Tests\Feature\Reporting;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\BookingPayment;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Plan;
use App\Services\Reporting\PlatformMetricsSnapshotter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-595 — AC20 bis : le flux encaissé suit l'*Encaissé*, et le MRR sort les essais (ADR-0057 §2).
 */
class PlatformRevenueMrrTest extends TestCase
{
    use RefreshDatabase;

    private function plan(int $price, string $code): Plan
    {
        return Plan::query()->create([
            'code' => $code, 'label' => $code, 'monthly_price_xof' => $price,
            'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 0,
        ]);
    }

    /** @param  array<string, mixed>  $extra */
    private function subscription(int $price, AgencySubscriptionStatus $status, array $extra = []): void
    {
        AgencySubscription::query()->create($extra + [
            'agency_id' => Agency::factory()->create()->id,
            'plan_id' => $this->plan($price, 'p'.$price.$status->value)->id,
            'status' => $status,
            'trial_ends_at' => $status === AgencySubscriptionStatus::Trialing ? '2026-08-01' : null,
            'current_period_start' => '2026-04-01',
            'current_period_end' => '2026-08-01',
        ]);
    }

    private function leasePayment(LeasePaymentType $type, float $amount): void
    {
        LeasePayment::factory()->create([
            'payment_type' => $type,
            'status' => PaymentStatus::Paid,
            'amount' => $amount,
            'paid_at' => '2026-07-14 09:00:00',
        ]);
    }

    public function test_ac20_bis_collected_total_excludes_deposits_and_counts_bookings(): void
    {
        Carbon::setTestNow('2026-07-15 10:00:00');
        $this->leasePayment(LeasePaymentType::Rent, 100_000);
        $this->leasePayment(LeasePaymentType::Deposit, 300_000);
        $this->leasePayment(LeasePaymentType::DepositRefund, 100_000);
        BookingPayment::factory()->create(['status' => PaymentStatus::Paid, 'amount' => 200_000, 'paid_at' => '2026-07-14 15:00:00']);
        $this->actingAsRole('super_admin');

        $revenue = $this->getJson('/api/admin/system/metrics')->assertOk()->json('data.revenue');

        $this->assertEquals(300000.0, $revenue['collected_total']);
        $this->assertEquals(300000.0, $revenue['platform_total_paid']);
    }

    public function test_ac20_bis_the_revenue_report_leaves_trials_out_of_the_mrr(): void
    {
        Carbon::setTestNow('2026-07-15 10:00:00');
        $this->subscription(10_000, AgencySubscriptionStatus::Active);
        $this->subscription(25_000, AgencySubscriptionStatus::Active);
        $this->subscription(15_000, AgencySubscriptionStatus::Trialing);
        $this->subscription(5_000, AgencySubscriptionStatus::PastDue);
        $this->actingAsRole('super_admin');

        $totals = $this->getJson('/api/admin/reports/revenue?period=3m&granularity=month')->assertOk()->json('data.totals');

        $this->assertEquals(40000.0, $totals['latest_mrr']);
        $this->assertSame(3, $totals['latest_active_subscriptions']);
        $this->assertEquals(15000.0, $totals['latest_mrr_trialing']);
    }

    public function test_ac20_bis_a_subscription_counts_only_after_its_trial_ends(): void
    {
        Carbon::setTestNow('2026-07-15 10:00:00');
        $this->subscription(10_000, AgencySubscriptionStatus::Active, [
            'current_period_start' => '2026-04-20',
            'trial_ends_at' => '2026-06-20',
        ]);
        $this->actingAsRole('super_admin');

        $rows = collect($this->getJson('/api/admin/reports/revenue?period=3m&granularity=month')->assertOk()->json('data.rows'))
            ->keyBy('bucket');

        $this->assertEquals(0.0, $rows['2026-05']['mrr']);
        $this->assertEquals(10000.0, $rows['2026-06']['mrr']);
    }

    /**
     * verif-595 m4 — la tuile « Flux encaissé » suit la règle de l'instantané (ADR-0057) : un paiement
     * marqué payé sans `paid_at` ne compte ni dans l'une ni dans l'autre. La tuile valait 140 000 pour
     * un instantané de 100 000, et la console aurait affiché +40 % sans aucun mouvement.
     */
    public function test_m4_the_collected_tile_and_its_snapshot_follow_one_rule(): void
    {
        Carbon::setTestNow('2026-07-15 10:00:00');
        LeasePayment::factory()->create([
            'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Paid,
            'amount' => 100_000, 'paid_at' => '2026-07-01 09:00:00',
        ]);
        LeasePayment::factory()->create([
            'payment_type' => LeasePaymentType::Rent, 'status' => PaymentStatus::Paid,
            'amount' => 40_000, 'paid_at' => null,
        ]);
        $snapshot = app(PlatformMetricsSnapshotter::class)->snapshot(Carbon::parse('2026-07-14'), true);
        $this->actingAsRole('super_admin');

        $collected = $this->getJson('/api/admin/system/metrics')->assertOk()->json('data.revenue.collected_total');

        $this->assertEquals(100000.0, (float) $snapshot->collected_total_amount);
        $this->assertEquals((float) $snapshot->collected_total_amount, (float) $collected);
    }
}
