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
            "/api/admin/users/{$user->id}",
            "/api/admin/users/{$user->id}/sessions",
            "/api/admin/users/{$user->id}/activity",
        ] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }
}
