<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Real-world check: a single user holds an `owner` role at agency A and an
 * `agent` role at agency B. The active profile chosen on the request should
 * fully determine which agency's permissions resolve via spatie's team-mode.
 *
 * If this regresses, role checks for multi-profile users would silently
 * leak permissions across agencies — the worst-case of the polymorphic
 * profile model.
 */
class PermissionResolutionWithActiveProfileTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);

        Route::prefix('api')
            ->middleware(['api', 'auth:sanctum'])
            ->get('/__test/can-update-properties', function () {
                return response()->json([
                    'team_id' => app(PermissionRegistrar::class)->getPermissionsTeamId(),
                    'roles' => request()->user()->getRoleNames()->values()->all(),
                    'can_update_properties' => request()->user()->can('properties.update'),
                ]);
            });
    }

    public function test_active_profile_determines_role_resolution(): void
    {
        $user = User::factory()->create();
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();
        $ownerA = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyA->id]);
        $agentB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agencyB->id]);

        $registrar = app(PermissionRegistrar::class);

        $registrar->setPermissionsTeamId($agencyA->id);
        $user->assignRole('owner');
        $registrar->setPermissionsTeamId($agencyB->id);
        $user->assignRole('agent');
        $registrar->setPermissionsTeamId(null);

        Sanctum::actingAs($user);

        // With agent profile (B) active, roles resolve in agency B's scope.
        $this->withHeaders(['X-Profile-Id' => "agent:{$agentB->id}"])
            ->getJson('/api/__test/can-update-properties')
            ->assertOk()
            ->assertJsonPath('team_id', $agencyB->id)
            ->assertJsonPath('roles', ['agent'])
            ->assertJsonPath('can_update_properties', true);

        // Switch to owner profile (A): roles must come from agency A.
        $this->withHeaders(['X-Profile-Id' => "owner:{$ownerA->id}"])
            ->getJson('/api/__test/can-update-properties')
            ->assertOk()
            ->assertJsonPath('team_id', $agencyA->id)
            ->assertJsonPath('roles', ['owner'])
            ->assertJsonPath('can_update_properties', true);
    }

    public function test_user_without_profile_resolves_no_agency_scoped_role(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->getJson('/api/__test/can-update-properties')
            ->assertOk()
            ->assertJsonPath('roles', []);
    }
}
