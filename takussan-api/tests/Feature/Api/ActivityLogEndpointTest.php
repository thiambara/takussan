<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\BookingPayment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

/**
 * Endpoint tests for the canonical `/api/activity-log` route (TCK-018 P1).
 *
 * The legacy `/api/audit-log` route is covered by `AuditLogTest` and kept
 * green as a back-compat regression surface — this file focuses on the
 * new route and the spatie/laravel-query-builder filters added in this
 * ticket (`filter[causer_id]`, `filter[date_from]`, `filter[date_to]`).
 */
class ActivityLogEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected Agency $agency;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
    }

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create(['agency_id' => $this->agency->id]);
        $this->materializeRoleProfile($admin, 'super_admin');
        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_non_admin_is_forbidden_on_canonical_route(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/activity-log')->assertStatus(403);
    }

    public function test_canonical_route_returns_same_payload_shape_as_legacy(): void
    {
        $this->actingAsAdmin();

        $this->getJson('/api/activity-log')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'log_name', 'event', 'description',
                        'causer_type', 'causer_id', 'subject_type', 'subject_id',
                    ],
                ],
                'meta' => ['total', 'current_page', 'last_page', 'per_page'],
            ]);
    }

    public function test_filter_by_causer_id_via_spatie_nested_syntax(): void
    {
        $admin = $this->actingAsAdmin();
        $otherUser = User::factory()->create(['agency_id' => $this->agency->id]);

        // Seed two logs with distinct causers.
        Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'event' => 'created',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
            'causer_type' => User::class,
            'causer_id' => $admin->id,
        ]);
        Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'event' => 'created',
            'subject_type' => User::class,
            'subject_id' => $otherUser->id,
            'causer_type' => User::class,
            'causer_id' => $otherUser->id,
        ]);

        $response = $this->getJson('/api/activity-log?filter[causer_id]='.$otherUser->id)
            ->assertOk();

        // Every returned row must belong to the filtered causer.
        $causerIds = array_column($response->json('data'), 'causer_id');
        $this->assertNotEmpty($causerIds);
        foreach ($causerIds as $id) {
            $this->assertSame($otherUser->id, $id);
        }
    }

    public function test_filter_by_date_range_via_spatie_nested_syntax(): void
    {
        $this->actingAsAdmin();

        Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'event' => 'created',
            'subject_type' => User::class,
            'subject_id' => 1,
            'created_at' => now()->subDays(30),
            'updated_at' => now()->subDays(30),
        ]);
        $recent = Activity::create([
            'log_name' => 'default',
            'description' => 'updated',
            'event' => 'updated',
            'subject_type' => User::class,
            'subject_id' => 1,
            'created_at' => now()->subDay(),
            'updated_at' => now()->subDay(),
        ]);

        $from = now()->subDays(2)->toDateTimeString();
        $to = now()->toDateTimeString();

        $response = $this->getJson("/api/activity-log?filter[date_from]={$from}&filter[date_to]={$to}")
            ->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertContains($recent->id, $ids);
        // The 30-day-old entry must not leak through the range filter.
        foreach ($response->json('data') as $row) {
            $this->assertGreaterThanOrEqual($from, $row['created_at']);
        }
    }

    public function test_filter_by_date_only_boundary_covers_full_day(): void
    {
        $this->actingAsAdmin();

        // Seed an Activity at noon on a deterministic target date. Without the
        // boundary-normalization fix, passing the same date-only string as
        // `filter[date_to]` compiles to `created_at <= YYYY-MM-DD 00:00:00`,
        // which would silently drop every row from that day.
        $target = now()->startOfMonth()->addDays(15)->setTime(12, 0, 0);
        $seeded = Activity::create([
            'log_name' => 'default',
            'description' => 'updated',
            'event' => 'updated',
            'subject_type' => User::class,
            'subject_id' => 1,
            'created_at' => $target,
            'updated_at' => $target,
        ]);

        $dateOnly = $target->toDateString();

        $response = $this->getJson("/api/activity-log?filter[date_from]={$dateOnly}&filter[date_to]={$dateOnly}")
            ->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertContains($seeded->id, $ids);
    }

    public function test_filter_by_event_via_spatie_nested_syntax(): void
    {
        $this->actingAsAdmin();

        Activity::create([
            'log_name' => 'default',
            'description' => 'deleted',
            'event' => 'deleted',
            'subject_type' => User::class,
            'subject_id' => 1,
        ]);

        $response = $this->getJson('/api/activity-log?filter[event]=deleted')
            ->assertOk();

        $events = array_column($response->json('data'), 'event');
        $this->assertNotEmpty($events);
        foreach ($events as $event) {
            $this->assertSame('deleted', $event);
        }
    }

    public function test_canonical_entity_route_returns_entity_scoped_logs(): void
    {
        $admin = $this->actingAsAdmin();

        Activity::create([
            'log_name' => 'default',
            'description' => 'updated',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
        ]);

        // Factory-created admin already has an auto `created` log + seeded one above.
        $this->getJson("/api/activity-log/user/{$admin->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_canonical_entity_route_resolves_multi_word_slug(): void
    {
        $this->actingAsAdmin();

        // Seed a log whose subject_type is a multi-word model FQCN. The
        // controller translates the URL segment (`booking_payment`) into a
        // suffix filter against `subject_type LIKE '%…'`. Plain `ucfirst`
        // would produce `Booking_payment` and miss `\App\Models\BookingPayment`
        // entirely — `Str::studly` is what maps the slug correctly.
        $seeded = Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'event' => 'created',
            'subject_type' => BookingPayment::class,
            'subject_id' => 42,
        ]);

        $response = $this->getJson('/api/activity-log/booking_payment/42')
            ->assertOk();

        $ids = array_column($response->json('data'), 'id');
        $this->assertContains($seeded->id, $ids);
    }
}
