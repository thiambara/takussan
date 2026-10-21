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
use App\Models\User;
use App\Notifications\ThresholdAlertTriggered;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\ApiTestCase;

/**
 * TCK-032 P3 — tests for KPI configs, threshold alerts CRUD and scheduled check.
 */
class ThresholdAlertTest extends ApiTestCase
{
    use RefreshDatabase;

    public function test_kpi_config_can_be_created_by_agency_admin(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $response = $this->apiPost('/api/kpi-configs', [
            'metric' => 'unpaid_rate_percent',
            'label' => 'Taux d\'impayés',
            'format' => 'percent',
            'sort_order' => 1,
        ])->assertStatus(201);

        $this->assertSame('unpaid_rate_percent', $response->json('data.metric'));
        $this->assertSame($agency->id, $response->json('data.agency_id'));
        $this->assertDatabaseHas('kpi_configs', [
            'agency_id' => $agency->id,
            'metric' => 'unpaid_rate_percent',
        ]);
    }

    public function test_kpi_config_rejects_unknown_metric(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPost('/api/kpi-configs', [
            'metric' => 'hello_world',
            'label' => 'x',
        ])->assertStatus(422);
    }

    public function test_kpi_config_cannot_cross_agencies(): void
    {
        $agency = Agency::factory()->create();
        $other = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $this->apiPost('/api/kpi-configs', [
            'agency_id' => $other->id,
            'metric' => 'unpaid_rate_percent',
            'label' => 'x',
        ])->assertForbidden();
    }

    public function test_kpi_metrics_catalog_endpoint(): void
    {
        $this->apiActingAsRole('agency_admin');

        $data = $this->apiGet('/api/kpi-configs/metrics')->assertOk()->json('data');
        $this->assertContains('unpaid_rate_percent', $data);
        $this->assertContains('occupancy_rate_percent', $data);
    }

    public function test_threshold_alert_can_be_created(): void
    {
        $agency = Agency::factory()->create();
        $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $response = $this->apiPost('/api/threshold-alerts', [
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 15.0,
            'severity' => 'warning',
        ])->assertStatus(201);

        $this->assertSame('unpaid_rate_percent', $response->json('data.metric'));
        $this->assertSame('>', $response->json('data.operator'));
    }

    public function test_threshold_alert_validates_operator(): void
    {
        $this->apiActingAsRole('agency_admin');
        $this->apiPost('/api/threshold-alerts', [
            'metric' => 'unpaid_rate_percent',
            'operator' => 'nope',
            'threshold' => 1,
        ])->assertStatus(422);
    }

    public function test_threshold_alert_fires_notification_and_stamps_last_triggered(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        // Build a high unpaid rate: one overdue, zero revenue.
        $lease = Lease::factory()->active()->create([
            'agency_id' => $agency->id,
            'monthly_rent' => 100_000,
        ]);
        $customer = Customer::factory()->create(['agency_id' => $agency->id]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $customer->id,
            'amount' => 80_000,
            'status' => PaymentStatus::Late,
            'paid_at' => null,
            'due_date' => now()->subDays(5)->toDateString(),
        ]);

        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 10.0,
            'severity' => 'critical',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        Notification::assertSentTo($admin, ThresholdAlertTriggered::class);

        $alert->refresh();
        $this->assertNotNull($alert->last_triggered_at);
        $this->assertGreaterThan(0, (float) $alert->last_value);
    }

    /**
     * P93.04 (TCK-1113) — une alerte ne va qu'aux admins dont le profil est
     * actif dans l'agence : un profil suspendu ou archivé n'en reçoit plus.
     */
    public function test_alert_skips_suspended_and_archived_agency_admins(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $active = User::factory()->create();
        $suspended = User::factory()->create();
        $archived = User::factory()->create();
        foreach ([$active, $suspended, $archived] as $user) {
            $this->materializeRoleProfile($user, 'agency_admin', $agency);
        }
        AgencyAdminProfile::query()->where('user_id', $suspended->id)
            ->update(['status' => AgencyAdminProfileStatus::Suspended->value]);
        AgencyAdminProfile::query()->where('user_id', $archived->id)
            ->update(['status' => AgencyAdminProfileStatus::Archived->value]);

        ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'overdue_count',
            'operator' => '>',
            'threshold' => -1, // se déclenche toujours (overdue_count >= 0)
            'severity' => 'warning',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        Notification::assertSentTo($active, ThresholdAlertTriggered::class);
        Notification::assertNotSentTo($suspended, ThresholdAlertTriggered::class);
        Notification::assertNotSentTo($archived, ThresholdAlertTriggered::class);
    }

    public function test_alert_respects_cooldown_window(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $admin = User::factory()->create(['agency_id' => $agency->id]);

        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'overdue_count',
            'operator' => '>',
            'threshold' => -1, // always triggers (overdue_count >= 0)
            'severity' => 'warning',
            'is_enabled' => true,
            'cooldown_hours' => 24,
            'last_triggered_at' => now()->subHours(2), // recent fire
        ]);

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        Notification::assertNothingSent();
    }

    public function test_should_trigger_logic_covers_operators(): void
    {
        $a = new ThresholdAlert([
            'metric' => 'x', 'operator' => '>', 'threshold' => 10, 'cooldown_hours' => 24,
        ]);
        $this->assertTrue($a->shouldTrigger(11));
        $this->assertFalse($a->shouldTrigger(10));

        $a->operator = '<';
        $this->assertTrue($a->shouldTrigger(9));
        $this->assertFalse($a->shouldTrigger(10));

        $a->operator = '>=';
        $this->assertTrue($a->shouldTrigger(10));

        $a->operator = '<=';
        $this->assertTrue($a->shouldTrigger(10));
    }

    public function test_threshold_alert_update_and_delete(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 5,
        ]);

        $this->apiPut("/api/threshold-alerts/{$alert->id}", ['threshold' => 20])->assertOk();
        $this->assertEquals(20, $alert->fresh()->threshold);

        $this->apiDelete("/api/threshold-alerts/{$alert->id}")->assertOk();
        $this->assertDatabaseMissing('threshold_alerts', ['id' => $alert->id]);
    }
}
