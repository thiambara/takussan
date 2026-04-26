<?php

namespace Tests\Feature\Api;

use App\Jobs\Audit\ExportActivityLogJob;
use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Spatie\Activitylog\Models\Activity;
use Tests\ApiTestCase;

/**
 * Feature tests for GET /api/activity-logs/export (TCK-104).
 *
 * Covers: CSV/XLSX format, agency scope isolation, date validation,
 * async fallback for > 5000 rows, and export audit hook.
 */
class ActivityLogExporterTest extends ApiTestCase
{
    use RefreshDatabase;

    // ─── helpers ───────────────────────────────────────────────────────────────

    private function makeLog(User $causer, string $event = 'created'): Activity
    {
        return Activity::create([
            'log_name' => 'default',
            'description' => $event,
            'event' => $event,
            'subject_type' => User::class,
            'subject_id' => $causer->id,
            'causer_type' => User::class,
            'causer_id' => $causer->id,
        ]);
    }

    // ─── AC1 — CSV streamé avec bonnes colonnes ────────────────────────────────

    public function test_agency_admin_gets_csv_with_correct_columns(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->makeLog($admin);

        $response = $this->apiGet('/api/activity-logs/export?format=csv');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'text/csv; charset=UTF-8');

        $body = $response->streamedContent();
        // All required columns must appear in the header row.
        foreach (['id', 'logged_at', 'causer_email', 'causer_role', 'event', 'subject_type', 'subject_id', 'description'] as $col) {
            $this->assertStringContainsString($col, $body, "Column {$col} missing from CSV header");
        }
    }

    // ─── AC2 — XLSX valide ─────────────────────────────────────────────────────

    public function test_agency_admin_gets_xlsx_file(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->makeLog($admin);

        $response = $this->apiGet('/api/activity-logs/export?format=xlsx');

        $response->assertOk();
        $contentType = (string) $response->headers->get('Content-Type');
        $this->assertTrue(
            str_contains($contentType, 'spreadsheetml') || str_contains($contentType, 'officedocument'),
            "Expected XLSX Content-Type, got: {$contentType}",
        );
    }

    // ─── AC3 — agent (non admin) → 403 ────────────────────────────────────────

    public function test_agent_role_is_forbidden(): void
    {
        $this->apiActingAsRole('agent');
        $this->apiGet('/api/activity-logs/export?format=csv')->assertForbidden();
    }

    public function test_unauthenticated_is_rejected(): void
    {
        $this->getJson('/api/activity-logs/export?format=csv')->assertUnauthorized();
    }

    // ─── AC4 — agency scoping ─────────────────────────────────────────────────

    public function test_agency_admin_does_not_see_logs_from_another_agency(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $adminA = $this->apiActingAsRole('agency_admin', ['agency' => $agencyA]);
        $userB = User::factory()->create([
            'agency_id' => $agencyB->id,
            'email' => 'unique-agencyB-user@example-b.test',
        ]);

        // Log by agencyA user.
        $this->makeLog($adminA);

        // Log by agencyB user — must NOT be visible to adminA.
        $this->makeLog($userB);

        $body = $this->apiGet('/api/activity-logs/export?format=csv')
            ->assertOk()
            ->streamedContent();

        // adminA's email appears (their own log is visible).
        $this->assertStringContainsString($adminA->email, $body);
        // agencyB user's email must NOT appear (cross-agency isolation).
        $this->assertStringNotContainsString('unique-agencyB-user@example-b.test', $body);
    }

    // ─── AC5 — date range validation ──────────────────────────────────────────

    public function test_date_from_after_date_to_returns_422(): void
    {
        $this->apiActingAsRole('agency_admin');

        $this->apiGet('/api/activity-logs/export?format=csv&filter[date_from]=2026-04-20&filter[date_to]=2026-04-01')
            ->assertUnprocessable();
    }

    public function test_date_range_over_one_year_returns_422(): void
    {
        $this->apiActingAsRole('agency_admin');

        $this->apiGet('/api/activity-logs/export?format=csv&filter[date_from]=2025-01-01&filter[date_to]=2026-06-01')
            ->assertUnprocessable();
    }

    // ─── AC6 — async for > 5000 rows ──────────────────────────────────────────

    public function test_large_export_dispatches_job_and_returns_202(): void
    {
        Queue::fake();

        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        // Seed 5001 activity log rows for this user so count > 5000.
        $rows = [];
        $nowTs = now()->toDateTimeString();
        for ($i = 0; $i < 5001; $i++) {
            $rows[] = [
                'log_name' => 'default',
                'description' => 'created',
                'event' => 'created',
                'subject_type' => User::class,
                'subject_id' => $admin->id,
                'causer_type' => User::class,
                'causer_id' => $admin->id,
                'properties' => '{}',
                'created_at' => $nowTs,
                'updated_at' => $nowTs,
            ];
        }
        Activity::insert($rows);

        $response = $this->apiGet('/api/activity-logs/export?format=csv');
        $response->assertStatus(202);

        Queue::assertPushed(ExportActivityLogJob::class);
    }

    // ─── AC7 — export action itself is logged ─────────────────────────────────

    public function test_export_action_creates_activity_log_entry(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);
        $this->makeLog($admin);

        $before = Activity::where('event', 'exported')->count();

        $this->apiGet('/api/activity-logs/export?format=csv')->assertOk();

        $after = Activity::where('event', 'exported')->count();
        $this->assertGreaterThan($before, $after, 'Export action should create an ActivityLog entry with event=exported');

        $exportLog = Activity::where('event', 'exported')->latest()->first();
        $this->assertNotNull($exportLog);
        $this->assertSame($admin->id, $exportLog->causer_id);
        $this->assertArrayHasKey('format', $exportLog->properties->toArray());
        $this->assertArrayHasKey('count', $exportLog->properties->toArray());
    }

    // ─── AC8 — CSV correctly escaped ──────────────────────────────────────────

    public function test_csv_correctly_escapes_special_chars(): void
    {
        $agency = Agency::factory()->create();
        $admin = $this->apiActingAsRole('agency_admin', ['agency' => $agency]);

        // Create a log with a description containing commas and quotes.
        Activity::create([
            'log_name' => 'default',
            'description' => 'Value with, comma and "quotes"',
            'event' => 'created',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
            'causer_type' => User::class,
            'causer_id' => $admin->id,
        ]);

        $body = $this->apiGet('/api/activity-logs/export?format=csv')
            ->assertOk()
            ->streamedContent();

        // fputcsv wraps fields containing commas/quotes in double quotes and escapes inner quotes.
        $this->assertStringContainsString('"Value with, comma and ""quotes"""', $body);
    }

    // ─── format validation ─────────────────────────────────────────────────────

    public function test_invalid_format_returns_422(): void
    {
        $this->apiActingAsRole('agency_admin');
        $this->apiGet('/api/activity-logs/export?format=pdf')->assertUnprocessable();
    }

    public function test_missing_format_returns_422(): void
    {
        $this->apiActingAsRole('agency_admin');
        $this->apiGet('/api/activity-logs/export')->assertUnprocessable();
    }

    // ─── super_admin sees everything ──────────────────────────────────────────

    public function test_super_admin_sees_logs_from_all_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $userA = User::factory()->create([
            'agency_id' => $agencyA->id,
            'email' => 'user-agency-a@example-a.test',
        ]);
        $userB = User::factory()->create([
            'agency_id' => $agencyB->id,
            'email' => 'user-agency-b@example-b.test',
        ]);

        $this->makeLog($userA);
        $this->makeLog($userB);

        $this->apiActingAsRole('super_admin');

        $body = $this->apiGet('/api/activity-logs/export?format=csv')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString('user-agency-a@example-a.test', $body);
        $this->assertStringContainsString('user-agency-b@example-b.test', $body);
    }
}
