<?php

namespace Tests\Feature\Auth;

use App\Models\Agency;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-146 — Strict active-profile semantics.
 *
 * Before TCK-146 a multi-agency user with `agency_admin` at agency Y could
 * silently administer agency X simply because they were a *member* there:
 * the role check resolved under their active team Y, and the legacy
 * `$user->agency_id` accessor either returned Y (matching) or fell back to
 * "first profile" outside HTTP scope. Either way, cross-tenant action was
 * possible without explicitly switching profiles.
 *
 * After TCK-146:
 *   1. The accessor no longer falls back to the *first* of N profiles —
 *      multi-profile users without an active context get `null`.
 *   2. Authz checks read `$request->activeProfile()?->agency_id` directly.
 *
 * These tests pin the new contract.
 */
class MultiProfileStrictAccessTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_multi_profile_user_without_active_context_resolves_null_agency_id(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        // Outside any request scope — accessor must return null rather than
        // silently picking the first profile.
        $this->assertNull($user->fresh()->agency_id);
    }

    public function test_single_profile_user_still_resolves_via_auto_bascule(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $agency->id]);

        // Auto-bascule for single-profile users keeps the accessor useful in
        // jobs / listeners that pre-date polymorphic profiles.
        $this->assertSame($agency->id, $user->fresh()->agency_id);
    }

    public function test_admin_acting_under_wrong_active_profile_cannot_admin_other_agency(): void
    {
        // Bob: agency_admin at Y (active), agent at X. Tries to admin X.
        $bob = User::factory()->create();
        $agencyX = Agency::factory()->create();
        $agencyY = Agency::factory()->create();

        AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyY->id]);
        AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyX->id]);

        // Assign agency_admin under Y's team — Bob's authority is Y-scoped.
        $this->materializeRoleProfile($bob, 'agency_admin', $agencyY);

        Sanctum::actingAs($bob);

        // Acting under Y, target X — must be rejected. Pre-TCK-146 this
        // succeeded because the membership check was the lax `isAgentAt(X)`.
        $agentProfileY = $bob->agentProfiles()->where('agency_id', $agencyY->id)->first();
        $response = $this->withHeaders(['X-Profile-Id' => "agent:{$agentProfileY->id}"])
            ->putJson("/api/agencies/{$agencyX->id}", ['name' => 'Hijacked']);

        $response->assertStatus(403);
    }

    public function test_active_profile_match_is_necessary_but_not_sufficient_without_role(): void
    {
        // Bob acting under X (only `agent` there, no agency_admin role).
        // Active-profile match is necessary but not sufficient — without an
        // agency_admin role at the same team the request is still 403.
        $bob = User::factory()->create();
        $agencyX = Agency::factory()->create();
        $agencyY = Agency::factory()->create();

        AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyY->id]);
        $agentX = AgentProfile::factory()->create(['user_id' => $bob->id, 'agency_id' => $agencyX->id]);

        $this->materializeRoleProfile($bob, 'agency_admin', $agencyY);

        Sanctum::actingAs($bob);

        // Active profile = X, but no agency_admin role at X → 403.
        $this->withHeaders(['X-Profile-Id' => "agent:{$agentX->id}"])
            ->putJson("/api/agencies/{$agencyX->id}", ['name' => 'Hijacked'])
            ->assertStatus(403);
    }

    public function test_admin_with_matching_active_profile_and_role_can_admin_their_agency(): void
    {
        // Positive case — Carol holds agency_admin at X *and* her active
        // profile is at X. Both halves of the strict check line up so the
        // request succeeds.
        $carol = User::factory()->create();
        $agencyX = Agency::factory()->create();
        $agentX = AgentProfile::factory()->create([
            'user_id' => $carol->id,
            'agency_id' => $agencyX->id,
        ]);

        $this->materializeRoleProfile($carol, 'agency_admin', $agencyX);

        Sanctum::actingAs($carol);

        $this->withHeaders(['X-Profile-Id' => "agent:{$agentX->id}"])
            ->putJson("/api/agencies/{$agencyX->id}", ['name' => 'Carol Realty'])
            ->assertOk();
    }

    public function test_property_policy_denies_cross_agency_access_under_wrong_active_profile(): void
    {
        // PropertyPolicy::update is the canonical authz path for the
        // duplicate / bulk-archive flows. A cross-agency leak here would
        // affect a wide blast radius.
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();

        $ownerA = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        $propertyB = Property::factory()->create(['agency_id' => $b->id]);

        Sanctum::actingAs($user);

        // Active profile pinned to A; target property is at B → policy denies.
        $headers = ['X-Profile-Id' => "owner:{$ownerA->id}"];
        $response = $this->withHeaders($headers)
            ->postJson("/api/properties/{$propertyB->id}/duplicate");

        $response->assertStatus(403);
    }
}
