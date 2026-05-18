<?php

namespace Tests\Feature\Api\Admin;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Activitylog\Models\Activity;
use Tests\BaseTestCase;

class UserDetailTest extends BaseTestCase
{
    use RefreshDatabase;

    public function test_super_admin_user_index_exposes_scoped_roles_agencies_and_security_columns(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);
        $user = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'email' => 'awa.roles@example.test',
            'email_verified_at' => now(),
            'two_factor_enabled' => true,
            'last_login_at' => '2026-05-01 08:00:00',
        ]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $user->assignRole('agent');

        $this->getJson('/api/admin/users?filter[search]=awa.roles@example.test&fields[users]=id,first_name,last_name,email,phone,status,email_verified_at,two_factor_enabled,last_login_at&include=roles,agentProfiles,ownerProfiles')
            ->assertOk()
            ->assertJsonPath('data.0.id', $user->id)
            ->assertJsonPath('data.0.roles.0.name', 'agent')
            ->assertJsonPath('data.0.roles.0.team_id', $agency->id)
            ->assertJsonPath('data.0.agencies.0.name', 'Dakar Immo')
            ->assertJsonPath('data.0.email_verified_at', fn ($value) => is_string($value) && $value !== '')
            ->assertJsonPath('data.0.two_factor_enabled', true)
            ->assertJsonPath('data.0.last_login_at', '2026-05-01T08:00:00+00:00');
    }

    public function test_super_admin_user_index_filters_by_role_agency_verified_and_two_factor(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create();
        $match = User::factory()->create([
            'email' => 'match@example.test',
            'email_verified_at' => now(),
            'two_factor_enabled' => true,
        ]);
        AgentProfile::factory()->create(['user_id' => $match->id, 'agency_id' => $agency->id]);
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $match->assignRole('agent');

        $other = User::factory()->create([
            'email' => 'other@example.test',
            'email_verified_at' => null,
            'two_factor_enabled' => false,
        ]);
        AgentProfile::factory()->create(['user_id' => $other->id, 'agency_id' => $agency->id]);
        $other->assignRole('customer');

        $ids = collect($this->getJson("/api/admin/users?filter[role]=agent&filter[agency_id]={$agency->id}&filter[email_verified]=1&filter[two_factor_enabled]=1")
            ->assertOk()
            ->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($match->id));
        $this->assertFalse($ids->contains($other->id));
    }

    public function test_super_admin_can_view_user_detail_without_secret_leaks(): void
    {
        $this->actingAsRole('super_admin');
        $agency = Agency::factory()->create(['name' => 'Dakar Immo']);
        $user = User::factory()->create([
            'first_name' => 'Awa',
            'last_name' => 'Ndiaye',
            'two_factor_enabled' => true,
            'two_factor_secret' => 'secret-value',
            'two_factor_recovery_codes' => json_encode(['abc']),
        ]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        $this->getJson("/api/admin/users/{$user->id}?fields[users]=id,first_name,last_name,email,status&include=roles")
            ->assertOk()
            ->assertJsonPath('data.full_name', 'Awa Ndiaye')
            ->assertJsonPath('data.mfa_enabled', true)
            ->assertJsonPath('data.agencies.0.name', 'Dakar Immo')
            ->assertJsonMissingPath('data.password')
            ->assertJsonMissingPath('data.remember_token')
            ->assertJsonMissingPath('data.two_factor_secret')
            ->assertJsonMissingPath('data.two_factor_recovery_codes');
    }

    public function test_sessions_endpoint_returns_active_sanctum_tokens_only(): void
    {
        $this->actingAsRole('super_admin');
        $user = User::factory()->create();
        $active = $user->createToken('mobile', ['*'], now()->addHour())->accessToken;
        $expired = $user->createToken('old', ['*'], now()->subMinute())->accessToken;
        $active->forceFill(['last_used_at' => now()->subMinute()])->save();

        $this->getJson("/api/admin/users/{$user->id}/sessions")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $active->id)
            ->assertJsonPath('data.0.name', 'mobile')
            ->assertJsonMissing(['token' => $active->token])
            ->assertJsonMissing(['id' => $expired->id]);
    }

    public function test_activity_endpoint_filters_user_as_causer_or_subject(): void
    {
        $this->actingAsRole('super_admin');
        $user = User::factory()->create();
        $other = User::factory()->create();
        Activity::query()->delete();

        activity('User')->causedBy($user)->event('caused')->log('caused by user');
        activity('User')->performedOn($user)->event('subject')->log('subject user');
        activity('User')->causedBy($other)->event('other')->log('other user');

        $this->getJson("/api/admin/users/{$user->id}/activity")
            ->assertOk()
            ->assertJsonPath('meta.total', 2);
    }

    public function test_agency_admin_is_forbidden_on_user_detail_routes(): void
    {
        $this->actingAsRole('agency_admin');
        $user = User::factory()->create();

        foreach ([
            '/api/admin/users',
            "/api/admin/users/{$user->id}",
            "/api/admin/users/{$user->id}/sessions",
            "/api/admin/users/{$user->id}/activity",
        ] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }
}
