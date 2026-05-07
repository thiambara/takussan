<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\AgencySubscription;
use App\Models\Enums\AgencySubscriptionStatus;
use App\Models\Plan;
use App\Models\ReportExport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class PlatformReportingTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_growth_endpoint_returns_envelope_with_buckets(): void
    {
        // Set the test clock BEFORE actingAs so the auto-created super-admin
        // agency stamps `created_at = 2026-05-15` and falls inside our window.
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        $baselineApril = Agency::query()->whereBetween('created_at', ['2026-04-01', '2026-04-30 23:59:59'])->count();
        $baselineMay = Agency::query()->whereBetween('created_at', ['2026-05-01', '2026-05-31 23:59:59'])->count();

        Agency::factory()->create(['created_at' => '2026-04-10']);
        Agency::factory()->create(['created_at' => '2026-04-20']);
        Agency::factory()->create(['created_at' => '2026-05-05']);

        $response = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')
            ->assertOk();

        $response->assertJsonPath('data.period.granularity', 'month');
        $rows = $response->json('data.rows');
        $this->assertNotNull($rows);

        $apr = collect($rows)->first(fn ($r) => str_starts_with($r['bucket'], '2026-04'));
        $may = collect($rows)->first(fn ($r) => str_starts_with($r['bucket'], '2026-05'));
        $this->assertSame($baselineApril + 2, $apr['count']);
        $this->assertSame($baselineMay + 1, $may['count']);

        Carbon::setTestNow();
    }

    public function test_revenue_mrr_matches_active_subscription_sum(): void
    {
        $this->actingAsRole('super_admin');

        Carbon::setTestNow('2026-05-15');

        $plan10 = Plan::query()->create([
            'code' => 'p10', 'label' => 'P10', 'monthly_price_xof' => 10_000,
            'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 0,
        ]);
        $plan25 = Plan::query()->create([
            'code' => 'p25', 'label' => 'P25', 'monthly_price_xof' => 25_000,
            'platform_fee_pct' => 0, 'trial_days' => 0, 'limits' => [], 'is_active' => true, 'sort_order' => 0,
        ]);

        $a1 = Agency::factory()->create(['created_at' => '2026-01-01']);
        $a2 = Agency::factory()->create(['created_at' => '2026-02-01']);
        $a3 = Agency::factory()->create(['created_at' => '2026-03-01']);

        AgencySubscription::query()->create([
            'agency_id' => $a1->id, 'plan_id' => $plan10->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => '2026-01-01', 'current_period_end' => '2027-01-01',
        ]);
        AgencySubscription::query()->create([
            'agency_id' => $a2->id, 'plan_id' => $plan25->id,
            'status' => AgencySubscriptionStatus::Active,
            'current_period_start' => '2026-02-01', 'current_period_end' => '2027-02-01',
        ]);
        // Ended subscription — must NOT contribute to MRR at month X if ended before X.
        AgencySubscription::query()->create([
            'agency_id' => $a3->id, 'plan_id' => $plan25->id,
            'status' => AgencySubscriptionStatus::Ended,
            'current_period_start' => '2026-03-01', 'current_period_end' => '2026-04-01',
            'ended_at' => '2026-04-15',
        ]);

        $response = $this->getJson('/api/admin/reports/revenue?period=3m&granularity=month')->assertOk();

        // Latest bucket (May): only a1+a2 active = 35_000.
        $this->assertEqualsWithDelta(35_000, $response->json('data.totals.latest_mrr'), 0.01);
        $this->assertEqualsWithDelta(35_000 * 12, $response->json('data.totals.latest_arr'), 0.01);
        $this->assertSame(2, $response->json('data.totals.latest_active_subscriptions'));

        Carbon::setTestNow();
    }

    public function test_cohorts_m0_is_100_percent_then_decays(): void
    {
        Carbon::setTestNow('2026-05-15');
        $this->actingAsRole('super_admin');

        // April cohort: 4 agencies, 1 churned mid-April (deleted_at < M0 end).
        Agency::factory()->count(3)->create(['created_at' => '2026-04-05']);
        Agency::factory()->create([
            'created_at' => '2026-04-10',
            'deleted_at' => '2026-04-20',
        ]);

        $response = $this->getJson('/api/admin/reports/cohorts?depth=3')->assertOk();

        $rows = $response->json('data.rows');
        $aprilCohort = collect($rows)->first(fn ($r) => $r['cohort'] === '2026-04');
        $this->assertNotNull($aprilCohort);
        $this->assertSame(4, $aprilCohort['cohort_size']);

        $m0 = collect($aprilCohort['cells'])->first(fn ($c) => $c['month'] === 0);
        // 1 churned before month-end → 3/4 still active at the M0 boundary.
        $this->assertEqualsWithDelta(0.75, $m0['rate'], 0.01);

        Carbon::setTestNow();
    }

    public function test_funnel_returns_4_stages(): void
    {
        $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/admin/reports/funnel?period=30d')->assertOk();

        $stages = collect($response->json('data.rows'))->pluck('stage')->all();
        $this->assertSame([
            'listings_published',
            'bookings_requested',
            'bookings_confirmed',
            'leases_signed',
        ], $stages);
    }

    public function test_cache_is_invalidated_when_a_new_agency_is_created(): void
    {
        $this->actingAsRole('super_admin');
        Cache::flush();

        // Warm the cache — no agencies yet.
        $first = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')->assertOk();
        $firstTotal = $first->json('data.totals.total');

        Agency::factory()->create();

        $second = $this->getJson('/api/admin/reports/growth?metric=agencies&period=3m&granularity=month')->assertOk();
        $secondTotal = $second->json('data.totals.total');

        $this->assertSame($firstTotal + 1, $secondTotal, 'Reporting cache must reflect the new agency without stale fallback.');
    }

    public function test_export_under_threshold_returns_payload_inline_and_audits(): void
    {
        $actor = $this->actingAsRole('super_admin');

        $response = $this->getJson('/api/admin/reports/funnel/export?format=csv&period=30d')->assertOk();
        $this->assertNotNull($response->json('data.rows'));

        $this->assertTrue(Activity::query()
            ->where('event', 'super_admin_report_exported')
            ->where('causer_id', $actor->id)
            ->exists());

        $this->assertSame(1, ReportExport::query()->count());
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $agency = Agency::factory()->create();
        $this->actingAsRole('agency_admin', ['agency' => $agency]);

        $this->getJson('/api/admin/reports/growth?metric=agencies')->assertForbidden();
        $this->getJson('/api/admin/reports/revenue')->assertForbidden();
        $this->getJson('/api/admin/reports/cohorts')->assertForbidden();
        $this->getJson('/api/admin/reports/funnel')->assertForbidden();
        $this->getJson('/api/admin/reports/funnel/export?format=csv')->assertForbidden();
    }

    public function test_export_with_unknown_report_returns_404(): void
    {
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/reports/unknown/export?format=csv')->assertStatus(404);
    }
}
