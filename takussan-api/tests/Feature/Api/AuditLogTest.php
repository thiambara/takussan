<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Booking;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_non_admin_cannot_query_audit_log(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/audit-log')->assertStatus(403);
    }

    public function test_admin_can_query_audit_log_and_see_model_changes(): void
    {
        $admin = $this->makeAdmin();
        Sanctum::actingAs($admin);

        $booking = Booking::factory()->create();
        $booking->update(['notes' => 'updated via audit test']);

        $response = $this->getJson('/api/audit-log?subject_type='.urlencode(Booking::class));

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [['id', 'log_name', 'event', 'subject_type', 'subject_id', 'properties', 'created_at']],
                'meta' => ['total', 'current_page', 'last_page', 'per_page'],
            ]);

        $this->assertGreaterThan(0, $response->json('meta.total'));
    }

    public function test_admin_can_filter_audit_log_by_event(): void
    {
        $admin = $this->makeAdmin();
        Sanctum::actingAs($admin);

        $booking = Booking::factory()->create();
        $booking->update(['notes' => 'filter test']);

        $response = $this->getJson('/api/audit-log?event=updated&subject_type='.urlencode(Booking::class));

        $response->assertOk();
        foreach ($response->json('data') as $entry) {
            $this->assertSame('updated', $entry['event']);
        }
    }

    protected function makeAdmin(): User
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        Role::findOrCreate('admin');

        $admin = User::factory()->create(['agency_id' => $agency->id]);
        $admin->assignRole('admin');

        return $admin;
    }
}
