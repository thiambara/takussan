<?php

namespace Tests\Feature\Api\Admin;

use App\Models\ScheduledTaskRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class HealthcheckJobsTest extends TestCase
{
    use RefreshDatabase;

    public function test_healthcheck_isolates_failed_sms_driver(): void
    {
        config(['sms.default_driver' => 'broken']);
        $this->actingAsRole('super_admin');

        $this->getJson('/api/admin/health')
            ->assertOk()
            ->assertJsonPath('data.db.status', 'ok')
            ->assertJsonPath('data.sms.status', 'failed');
    }

    public function test_agency_admin_is_forbidden(): void
    {
        $this->actingAsRole('agency_admin');

        $this->getJson('/api/admin/health')->assertForbidden();
        $this->getJson('/api/admin/jobs/failed')->assertForbidden();
        $this->getJson('/api/admin/scheduler')->assertForbidden();
    }

    public function test_failed_jobs_list_truncates_payload(): void
    {
        $this->actingAsRole('super_admin');
        DB::table('failed_jobs')->insert([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => str_repeat('x', 1500),
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->getJson('/api/admin/jobs/failed')
            ->assertOk()
            ->assertJsonPath('data.0.queue', 'default');

        $this->assertLessThanOrEqual(1025, strlen($this->getJson('/api/admin/jobs/failed')->json('data.0.payload')));
    }

    public function test_retry_all_is_bounded_to_500_jobs(): void
    {
        $this->actingAsRole('super_admin');
        for ($i = 0; $i < 501; $i++) {
            DB::table('failed_jobs')->insert([
                'uuid' => (string) Str::uuid(),
                'connection' => 'database',
                'queue' => 'default',
                'payload' => '{}',
                'exception' => 'boom',
                'failed_at' => now(),
            ]);
        }

        $this->postJson('/api/admin/jobs/failed/retry-all')->assertStatus(409);
    }

    public function test_delete_failed_job_is_audited(): void
    {
        $this->actingAsRole('super_admin');
        $id = DB::table('failed_jobs')->insertGetId([
            'uuid' => (string) Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => '{}',
            'exception' => 'boom',
            'failed_at' => now(),
        ]);

        $this->deleteJson("/api/admin/jobs/failed/{$id}")->assertOk();

        $this->assertTrue(Activity::query()->where('event', 'super_admin_job_deleted')->exists());
    }

    public function test_scheduler_returns_last_run(): void
    {
        $this->actingAsRole('super_admin');
        ScheduledTaskRun::query()->create([
            'task' => 'daily-cleanup',
            'last_run_at' => now(),
            'duration_ms' => 123,
            'status' => 'finished',
        ]);

        $this->getJson('/api/admin/scheduler')
            ->assertOk()
            ->assertJsonPath('data.0.task', 'daily-cleanup');
    }
}
