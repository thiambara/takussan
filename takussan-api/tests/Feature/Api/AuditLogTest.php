<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->dummyAgency = Agency::factory()->create();
        Role::create(['name' => 'admin', 'team_id' => $this->dummyAgency->id]);
        setPermissionsTeamId($this->dummyAgency->id);
    }

    public function test_only_admins_can_access_audit_logs(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->getJson('/api/audit-log')->assertStatus(403);
    }

    public function test_admin_can_list_audit_logs(): void
    {
        $admin = User::factory()->create(['agency_id' => $this->dummyAgency->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        Activity::create([
            'log_name' => 'default',
            'description' => 'created',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
            'causer_type' => User::class,
            'causer_id' => $admin->id,
            'event' => 'created',
        ]);

        $this->getJson('/api/audit-log')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => [
                        'id', 'log_name', 'event', 'description', 'causer_type', 'causer_id', 'subject_type', 'subject_id',
                    ],
                ],
                'meta' => ['total', 'current_page', 'last_page', 'per_page'],
            ]);

        $this->getJson('/api/audit-log?log_name=default&event=created')
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_admin_can_get_audit_logs_by_entity(): void
    {
        $admin = User::factory()->create(['agency_id' => $this->dummyAgency->id]);
        $admin->assignRole('admin');
        Sanctum::actingAs($admin);

        Activity::create([
            'log_name' => 'default',
            'description' => 'updated',
            'subject_type' => User::class,
            'subject_id' => $admin->id,
        ]);

        $this->getJson("/api/audit-log/user/{$admin->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }
}
