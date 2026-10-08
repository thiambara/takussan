<?php

namespace Tests\Feature\Reporting;

use App\Jobs\Reporting\SnapshotPlatformMetricsJob;
use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\BookingPayment;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentStatus;
use App\Models\LeasePayment;
use App\Models\Plan;
use App\Models\PlatformMetricDaily;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * TCK-595 — AC20 : l'instantané quotidien de la console plateforme (ADR-0057).
 *
 * Le 2026-07-14 : un loyer de 100 000 à 5 % de frais, une réservation de 200 000 à 10 %. Deux
 * abonnements actifs (10 000 et 25 000), un en essai (15 000), un `past_due` (5 000).
 */
class PlatformMetricsSnapshotTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-07-14 12:00:00');

        LeasePayment::factory()->create([
            'payment_type' => LeasePaymentType::Rent,
            'status' => PaymentStatus::Paid,
            'amount' => 100_000,
            'paid_at' => '2026-07-14 09:00:00',
            'platform_fee_pct_at_payment' => 5,
        ]);
        BookingPayment::factory()->create([
            'status' => PaymentStatus::Paid,
            'amount' => 200_000,
            'paid_at' => '2026-07-14 15:00:00',
            'platform_fee_pct_at_payment' => 10,
        ]);

        foreach ([[10_000, AgencySubscriptionStatus::Active], [25_000, AgencySubscriptionStatus::Active], [15_000, AgencySubscriptionStatus::Trialing], [5_000, AgencySubscriptionStatus::PastDue]] as $i => [$price, $status]) {
            $plan = Plan::query()->create([
                'code' => "p{$i}", 'label' => "P{$i}", 'monthly_price_xof' => $price,
                'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => $i,
            ]);
            AgencySubscription::query()->create([
                'agency_id' => Agency::factory()->create()->id,
                'plan_id' => $plan->id,
                'status' => $status,
                'trial_ends_at' => $status === AgencySubscriptionStatus::Trialing ? '2026-08-01' : null,
                'current_period_start' => '2026-06-01',
                'current_period_end' => '2026-08-01',
            ]);
        }

        Carbon::setTestNow('2026-07-15 00:30:00');
    }

    public function test_ac20_the_job_writes_yesterday_with_flows_and_stocks(): void
    {
        SnapshotPlatformMetricsJob::dispatchSync();

        $row = PlatformMetricDaily::query()->sole();
        $this->assertSame('2026-07-14', $row->date->toDateString());
        $this->assertEquals(300000.0, (float) $row->gmv_amount);
        $this->assertEquals(25000.0, (float) $row->platform_fees_amount);
        $this->assertEquals(300000.0, (float) $row->collected_total_amount);
        $this->assertEquals(40000.0, (float) $row->mrr_amount);
        $this->assertEquals(15000.0, (float) $row->mrr_trialing_amount);
        $this->assertSame(3, $row->active_subscriptions);
        $this->assertSame(4, $row->agencies_total);
        $this->assertNotNull($row->stocks_captured_at);
    }

    public function test_ac20_a_second_run_rewrites_the_same_line(): void
    {
        SnapshotPlatformMetricsJob::dispatchSync();
        SnapshotPlatformMetricsJob::dispatchSync();
        $this->artisan('metrics:snapshot')->assertSuccessful();

        $this->assertSame(1, PlatformMetricDaily::query()->count());
    }

    public function test_ac20_the_console_reads_the_take_rate_and_has_no_trend_without_a_snapshot(): void
    {
        $this->actingAsRole('super_admin');

        $data = $this->getJson('/api/admin/system/metrics')->assertOk()->json('data');

        $this->assertEquals(0.0833, $data['revenue']['take_rate']);
        $this->assertEquals(300000.0, $data['revenue']['gmv_30d']);
        $this->assertEquals(25000.0, $data['revenue']['platform_fees_30d']);
        $this->assertEquals(40000.0, $data['revenue']['mrr']);
        $this->assertEquals(15000.0, $data['revenue']['mrr_trialing']);
        $this->assertArrayNotHasKey('revenue_collected_total', $data['trend']['previous']);
        $this->assertArrayNotHasKey('revenue_mrr', $data['trend']['previous']);
    }

    public function test_a_past_day_is_backfilled_with_flows_only_and_keeps_stocks_already_measured(): void
    {
        $this->artisan('metrics:snapshot', ['--date' => '2026-07-10'])->assertSuccessful();
        $past = PlatformMetricDaily::query()->whereDate('date', '2026-07-10')->sole();
        $this->assertEquals(0.0, (float) $past->gmv_amount);
        $this->assertNull($past->mrr_amount);
        $this->assertNull($past->agencies_total);
        $this->assertNull($past->stocks_captured_at);

        SnapshotPlatformMetricsJob::dispatchSync();
        Carbon::setTestNow('2026-07-20 10:00:00');
        $this->artisan('metrics:snapshot', ['--date' => '2026-07-14'])->assertSuccessful();

        $row = PlatformMetricDaily::query()->whereDate('date', '2026-07-14')->sole();
        $this->assertEquals(300000.0, (float) $row->gmv_amount);
        $this->assertEquals(40000.0, (float) $row->mrr_amount, 'un rattrapage n’efface pas les stocks mesurés');
    }

    public function test_today_and_the_future_are_refused(): void
    {
        $this->artisan('metrics:snapshot', ['--date' => '2026-07-15'])->assertFailed();
        $this->artisan('metrics:snapshot', ['--date' => '2026-08-01'])->assertFailed();
        $this->artisan('metrics:snapshot', ['--date' => 'hier'])->assertFailed();

        $this->assertSame(0, PlatformMetricDaily::query()->count());
    }
}
