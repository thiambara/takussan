<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\Customer;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\ThresholdAlert;
use App\Services\Dashboard\KpiResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\ApiTestCase;
use Tests\Concerns\CreatesAgencyMembers;

/**
 * TCK-2627 — AC1 : l'alerte se lit avec la valeur ACTUELLE de sa mesure, et dit qui elle prévient.
 * `last_value` n'est écrite qu'au déclenchement : une alerte jamais déclenchée n'avait aucune valeur.
 */
class ThresholdAlertCurrentValueTest extends ApiTestCase
{
    use CreatesAgencyMembers;
    use RefreshDatabase;

    private Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-15 10:00:00');
        $this->agency = Agency::factory()->create();
    }

    public function test_ac1_a_never_triggered_alert_reads_the_current_value_and_its_recipients(): void
    {
        $this->unpaidRateOf391();
        $admin = $this->agencyAdmin($this->agency);
        $admin->update(['first_name' => 'Awa', 'last_name' => 'Ndiaye']);
        $second = $this->agencyAdmin($this->agency);
        $suspended = $this->agencyAdmin($this->agency);
        AgencyAdminProfile::query()->where('user_id', $suspended->id)->update(['status' => AgencyAdminProfileStatus::Suspended->value]);
        $this->agencyAgent($this->agency);
        $this->agencyAdmin(Agency::factory()->create());
        $alert = $this->alert('unpaid_rate_percent');

        $row = $this->actingAsApi($admin)->getJson('/api/threshold-alerts')->assertOk()->json('data.0');

        $this->assertSame($alert->id, $row['id']);
        $this->assertEquals(3.91, $row['current_value']);
        $this->assertNull($row['last_triggered_at']);
        $this->assertSame(2, $row['recipients']['count']);
        $this->assertEqualsCanonicalizing([$admin->id, $second->id], array_column($row['recipients']['users'], 'id'));
        $this->assertContains('Awa Ndiaye', array_column($row['recipients']['users'], 'name'));
        $this->assertSame(['inapp', 'email'], $row['channels']);
        $this->assertArrayNotHasKey('triggers', $row);
    }

    public function test_the_current_value_is_null_without_a_denominator(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->alert('occupancy_rate_percent');

        $row = $this->actingAsApi($admin)->getJson('/api/threshold-alerts')->assertOk()->json('data.0');

        $this->assertArrayHasKey('current_value', $row);
        $this->assertNull($row['current_value']);
    }

    public function test_five_alerts_are_read_with_a_single_resolution(): void
    {
        $this->unpaidRateOf391();
        $admin = $this->agencyAdmin($this->agency);
        foreach (ThresholdAlert::allowedMetrics() as $metric) {
            $this->alert($metric);
        }
        $spy = new class(app(KpiResolver::class)) extends KpiResolver
        {
            public int $calls = 0;

            public function __construct(private readonly KpiResolver $inner) {}

            public function forAgency(Agency $agency): array
            {
                $this->calls++;

                return $this->inner->forAgency($agency);
            }
        };
        $this->app->instance(KpiResolver::class, $spy);

        $rows = $this->actingAsApi($admin)->getJson('/api/threshold-alerts')->assertOk()->json('data');

        $this->assertGreaterThanOrEqual(5, count($rows));
        $this->assertSame(1, $spy->calls);
        $byMetric = collect($rows)->keyBy('metric');
        $this->assertEquals(3.91, $byMetric['unpaid_rate_percent']['current_value']);
        $this->assertSame(1, $byMetric['overdue_count']['current_value']);
    }

    public function test_the_query_count_does_not_depend_on_the_number_of_alerts(): void
    {
        $admin = $this->agencyAdmin($this->agency);
        $this->agencyAdmin($this->agency);
        $this->alert('overdue_count');
        $this->actingAsApi($admin)->getJson('/api/threshold-alerts?include=triggers')->assertOk();

        $count = function (): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->getJson('/api/threshold-alerts?include=triggers')->assertOk();
            $n = count(DB::getQueryLog());
            DB::disableQueryLog();

            return $n;
        };
        $one = $count();
        foreach (range(1, 4) as $_) {
            $this->alert('maintenance_open');
        }
        $five = $count();

        $this->assertSame($one, $five, "1 alerte : {$one}, 5 alertes : {$five}");
    }

    public function test_show_reads_the_same_and_stays_inside_the_agency(): void
    {
        $this->unpaidRateOf391();
        $admin = $this->agencyAdmin($this->agency);
        $alert = $this->alert('unpaid_rate_percent');

        $data = $this->actingAsApi($admin)->getJson("/api/threshold-alerts/{$alert->id}")->assertOk()->json('data');
        $this->assertEquals(3.91, $data['current_value']);
        $this->assertSame(1, $data['recipients']['count']);

        $this->actingAsApi($this->agencyAdmin(Agency::factory()->create()))
            ->getJson("/api/threshold-alerts/{$alert->id}")->assertForbidden();
    }

    private function alert(string $metric): ThresholdAlert
    {
        return ThresholdAlert::create([
            'agency_id' => $this->agency->id,
            'metric' => $metric,
            'operator' => '>',
            'threshold' => 10.0,
            'severity' => 'critical',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);
    }

    /** 39 100 impayés sur 1 000 000 facturés : 3,91 %. */
    private function unpaidRateOf391(): void
    {
        $lease = Lease::factory()->active()->create(['agency_id' => $this->agency->id, 'monthly_rent' => 100_000]);
        $payer = Customer::factory()->create(['agency_id' => $this->agency->id])->id;
        LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $payer, 'amount' => 960_900,
            'status' => PaymentStatus::Paid, 'paid_at' => now()->subDays(9), 'due_date' => now()->subDays(10)->toDateString(),
        ]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id, 'payer_id' => $payer, 'amount' => 39_100,
            'status' => PaymentStatus::Late, 'paid_at' => null, 'due_date' => now()->subDays(5)->toDateString(),
        ]);
    }
}
