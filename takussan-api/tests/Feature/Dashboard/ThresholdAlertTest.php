<?php

namespace Tests\Feature\Dashboard;

use App\Models\Agency;
use App\Models\AppNotification;
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
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;
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
     * P97.01 (TCK-1122) — le bouton du courriel mène au tableau de bord du FRONT. Il était
     * `url('/app/overview')` : envoyé par la commande planifiée, hors requête, il prenait
     * `APP_URL`, l'hôte de l'API, qui n'a aucune route `app/overview` (404).
     */
    public function test_mail_action_targets_the_front_dashboard(): void
    {
        config(['app.frontend_url' => 'https://front.exemple.test/']);

        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'unpaid_rate_percent',
            'operator' => '>',
            'threshold' => 10.0,
            'severity' => 'critical',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);

        $mail = (new ThresholdAlertTriggered($alert, 42.0))->toMail($admin);

        $this->assertSame('https://front.exemple.test/app/overview', $mail->actionUrl);
    }

    /**
     * P93.04 (TCK-1113) — une alerte ne va qu'aux admins dont le profil est
     * actif dans l'agence : un profil suspendu ou archivé n'en reçoit plus.
     */
    /**
     * P123.05 (TCK-1249) — un courriel qui échoue n'arrête plus la tâche et ne fait plus récrire la
     * cloche : l'alerte est marquée avant l'envoi, et l'échec rattrapé alerte par alerte. Avant,
     * `Notification::send()` levait avant `last_triggered_at` : la seconde agence n'était jamais
     * jugée, et chaque passage horaire récrivait la cloche de la première.
     */
    public function test_un_courriel_qui_echoue_n_arrete_pas_la_tache_ni_ne_fait_recrire_la_cloche(): void
    {
        Mail::extend('panne', fn () => new class extends AbstractTransport
        {
            protected function doSend(SentMessage $message): void
            {
                throw new TransportException('Transport indisponible (test).');
            }

            public function __toString(): string
            {
                return 'panne://';
            }
        });
        config(['mail.mailers.panne' => ['transport' => 'panne'], 'mail.default' => 'panne']);
        Mail::purge('panne');

        $alertes = [];
        $admins = [];
        foreach ([1, 2] as $_) {
            $agency = Agency::factory()->create();
            $admin = User::factory()->create(['email' => fake()->unique()->safeEmail()]);
            $this->materializeRoleProfile($admin, 'agency_admin', $agency);
            $lease = Lease::factory()->active()->create(['agency_id' => $agency->id, 'monthly_rent' => 100_000]);
            LeasePayment::factory()->create([
                'lease_id' => $lease->id,
                'payer_id' => Customer::factory()->create(['agency_id' => $agency->id])->id,
                'amount' => 80_000,
                'status' => PaymentStatus::Late,
                'paid_at' => null,
                'due_date' => now()->subDays(5)->toDateString(),
            ]);
            $alertes[] = ThresholdAlert::create([
                'agency_id' => $agency->id,
                'metric' => 'unpaid_rate_percent',
                'operator' => '>',
                'threshold' => 10.0,
                'severity' => 'critical',
                'is_enabled' => true,
                'cooldown_hours' => 24,
            ]);
            $admins[] = $admin;
        }

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);
        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        foreach ($alertes as $i => $alerte) {
            $this->assertNotNull($alerte->fresh()->last_triggered_at, "alerte {$i} jugée et marquée");
            $this->assertSame(1, AppNotification::query()->where('user_id', $admins[$i]->id)->count(), "une seule cloche pour l'admin {$i}");
        }
    }

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

    /**
     * P93.05 (TCK-1114) — une agence sans bien n'a pas de taux d'occupation : l'alerte
     * « occupation sous le seuil » ne se juge pas sur une valeur absente.
     */
    public function test_alert_is_not_evaluated_on_a_null_metric(): void
    {
        Notification::fake();

        $agency = Agency::factory()->create();
        $admin = User::factory()->create();
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        $alert = ThresholdAlert::create([
            'agency_id' => $agency->id,
            'metric' => 'occupancy_rate_percent',
            'operator' => '<',
            'threshold' => 50,
            'severity' => 'warning',
            'is_enabled' => true,
            'cooldown_hours' => 24,
        ]);

        $this->artisan('dashboard:check-alerts')->assertExitCode(0);

        Notification::assertNothingSent();
        $alert->refresh();
        $this->assertNull($alert->last_triggered_at);
        $this->assertNull($alert->last_value);
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
