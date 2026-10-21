<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Enums\ScheduledTaskRunStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\ScheduledTaskRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * TCK-1116 (P94.01) — les instants que la console compose À LA MAIN, hors ressource, sortent sous
 * la forme d'ADR-0018 : UTC, `DATE_ATOM`.
 *
 * ⚠ La chaîne exacte est le contrat, et non un `assertNotNull` : PostgreSQL rend une colonne
 * `timestamp without time zone` en `2026-10-18 21:54:01`, sans `T` ni fuseau, et le front la lit
 * alors dans le fuseau du NAVIGATEUR (`new Date(…)`), soit une heure fausse de son décalage hors
 * UTC. Seule la forme `…T21:54:01+00:00` désigne un instant.
 */
class ConsoleInstantFormatTest extends TestCase
{
    use RefreshDatabase;

    private const SQL = '2026-10-18 21:54:01';

    private const ATTENDU = '2026-10-18T21:54:01+00:00';

    protected function setUp(): void
    {
        parent::setUp();
        $this->actingAsRole('super_admin');
    }

    public function test_last_platform_payment_of_an_agency_is_an_utc_instant(): void
    {
        $agency = Agency::factory()->create();
        $lease = Lease::factory()->create(['agency_id' => $agency->id]);
        LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'status' => PaymentStatus::Paid,
            'paid_at' => self::SQL,
        ]);

        $this->getJson("/api/admin/agencies/{$agency->id}/health")
            ->assertOk()
            ->assertJsonPath('data.last_platform_payment_at', self::ATTENDU);
    }

    public function test_an_agency_without_payment_keeps_a_null_instant(): void
    {
        $agency = Agency::factory()->create();

        $this->getJson("/api/admin/agencies/{$agency->id}/health")
            ->assertOk()
            ->assertJsonPath('data.last_platform_payment_at', null);
    }

    public function test_last_run_of_a_scheduled_task_is_an_utc_instant(): void
    {
        $this->enregistrerUneExecution();

        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.last_run_at', self::ATTENDU);
    }

    public function test_last_run_of_the_scheduler_in_the_healthcheck_is_an_utc_instant(): void
    {
        $this->enregistrerUneExecution();

        $this->getJson('/api/admin/health')
            ->assertOk()
            ->assertJsonPath('data.scheduler.last_run_at', self::ATTENDU);
    }

    public function test_failed_at_of_a_failed_job_is_an_utc_instant_in_the_list_and_the_detail(): void
    {
        $id = DB::table('failed_jobs')->insertGetId([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'boom',
            'failed_at' => self::SQL,
        ]);

        $this->getJson('/api/admin/jobs/failed')
            ->assertOk()
            ->assertJsonPath('data.0.failed_at', self::ATTENDU);

        $this->getJson("/api/admin/jobs/failed/{$id}")
            ->assertOk()
            ->assertJsonPath('data.failed_at', self::ATTENDU);
    }

    private function enregistrerUneExecution(): void
    {
        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => self::SQL,
            'duration_ms' => 100,
            'status' => ScheduledTaskRunStatus::Finished,
        ]);
    }
}
