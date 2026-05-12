<?php

namespace Tests\Feature\Middleware;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

/**
 * Probes the resolution order on a synthetic route that echoes the team_id
 * Spatie sees once the middleware finishes — that's the contract that
 * matters for downstream authorization.
 */
class ResolveActiveProfileTest extends TestCase
{
    use RefreshDatabase;

    private const PROBE_ROUTE = '/api/__test/active-profile-probe';

    protected function setUp(): void
    {
        parent::setUp();

        Route::prefix('api')
            ->middleware(['api', 'auth:sanctum'])
            ->get('/__test/active-profile-probe', function () {
                $profile = request()->activeProfile();

                return response()->json([
                    'team_id' => app(PermissionRegistrar::class)->getPermissionsTeamId(),
                    'profile_id' => $profile?->getKey(),
                    'profile_class' => $profile ? $profile::class : null,
                ]);
            });
    }

    public function test_header_x_profile_id_takes_precedence_and_sets_team_id(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $ownerA = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agentB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $this->withHeaders(['X-Profile-Id' => "agent:{$agentB->id}"])
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $b->id)
            ->assertJsonPath('profile_id', $agentB->id);

        // Header still wins over a different cookie value.
        $this->withCredentials()->withUnencryptedCookie('active_profile_id', "owner:{$ownerA->id}")
            ->withHeaders(['X-Profile-Id' => "agent:{$agentB->id}"])
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $b->id);
    }

    public function test_query_profile_id_is_honored_when_header_absent(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);

        Sanctum::actingAs($user);

        $this->getJson(self::PROBE_ROUTE."?profile_id=owner:{$owner->id}")
            ->assertOk()
            ->assertJsonPath('team_id', $a->id)
            ->assertJsonPath('profile_id', $owner->id);
    }

    public function test_explicit_signal_for_foreign_profile_returns_403(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create();
        $foreignOwner = OwnerProfile::factory()->create([
            'user_id' => $other->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($me);

        $this->withHeaders(['X-Profile-Id' => "owner:{$foreignOwner->id}"])
            ->getJson(self::PROBE_ROUTE)
            ->assertStatus(403);
    }

    public function test_cookie_falls_back_when_no_explicit_signal(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agentB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $this->withCredentials()->withUnencryptedCookie('active_profile_id', "agent:{$agentB->id}")
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $b->id)
            ->assertJsonPath('profile_id', $agentB->id);
    }

    public function test_invalid_cookie_is_ignored_silently(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);

        Sanctum::actingAs($user);

        // Stale cookie pointing at a profile that no longer exists for this
        // user — middleware must not abort, just fall back to auto-single.
        $this->withCredentials()->withUnencryptedCookie('active_profile_id', 'owner:99999')
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $a->id)
            ->assertJsonPath('profile_id', $owner->id);
    }

    public function test_auto_bascule_when_user_has_exactly_one_profile(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $profile = OwnerProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
        ]);

        Sanctum::actingAs($user);

        $this->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $agency->id)
            ->assertJsonPath('profile_id', $profile->id);
    }

    public function test_no_profile_does_not_abort_for_admin_users(): void
    {
        $admin = User::factory()->create();

        Sanctum::actingAs($admin);

        $response = $this->getJson(self::PROBE_ROUTE)->assertOk();

        // No profile resolved — the request scope holds no active_profile.
        $this->assertNull($response->json('profile_id'));
        $this->assertNull($response->json('profile_class'));
    }

    public function test_active_profile_hint_header_resolves_like_a_cookie(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agentB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $this->withHeaders(['X-Active-Profile-Hint' => "agent:{$agentB->id}"])
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $b->id)
            ->assertJsonPath('profile_id', $agentB->id);
    }

    public function test_stale_active_profile_hint_is_silently_ignored(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);

        Sanctum::actingAs($user);

        // A stale hint (e.g. a cookie value left over after migrate:fresh
        // --seed) must not abort the request — soft signal, mirrors the
        // cookie semantics. Fallback paths still resolve the active profile.
        $this->withHeaders(['X-Active-Profile-Hint' => 'owner:99999'])
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $a->id)
            ->assertJsonPath('profile_id', $owner->id);
    }

    public function test_strict_header_still_beats_active_profile_hint(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $ownerA = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        $agentB = AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $this->withHeaders([
            'X-Profile-Id' => "agent:{$agentB->id}",
            'X-Active-Profile-Hint' => "owner:{$ownerA->id}",
        ])
            ->getJson(self::PROBE_ROUTE)
            ->assertOk()
            ->assertJsonPath('team_id', $b->id)
            ->assertJsonPath('profile_id', $agentB->id);
    }

    public function test_multiple_profiles_without_signal_does_not_pick_arbitrarily(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $response = $this->getJson(self::PROBE_ROUTE)->assertOk();

        // Resolver should refuse to guess. Downstream legacy team_id stays
        // whatever was set earlier in the pipeline (here: null).
        $this->assertNull($response->json('profile_id'));
    }
}
