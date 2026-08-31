<?php

namespace Tests\Feature\Api\Me;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use App\Services\Profiles\ActiveProfileResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SelectActiveProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_patch_active_profile_returns_selected_profile_and_persists_cookie(): void
    {
        $user = User::factory()->create();
        $a = Agency::factory()->create();
        $b = Agency::factory()->create();
        $owner = OwnerProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $a->id]);
        AgentProfile::factory()->create(['user_id' => $user->id, 'agency_id' => $b->id]);

        Sanctum::actingAs($user);

        $response = $this->patchJson('/api/me/active-profile', [
            'profile_id' => "owner:{$owner->id}",
        ])->assertOk();

        $response
            ->assertJsonPath('data.id', "owner:{$owner->id}")
            ->assertJsonPath('data.type', 'owner')
            ->assertJsonPath('data.agency_id', $a->id);

        $cookies = $response->headers->getCookies();
        $names = array_map(fn ($c) => $c->getName(), $cookies);
        $this->assertContains('active_profile_id', $names);

        $cookie = collect($cookies)->firstWhere(fn ($c) => $c->getName() === 'active_profile_id');
        $this->assertSame("owner:{$owner->id}", $cookie->getValue());
        $this->assertTrue($cookie->isHttpOnly());
    }

    public function test_patch_active_profile_returns_403_for_other_users_profile(): void
    {
        $me = User::factory()->create();
        $other = User::factory()->create();
        $agency = Agency::factory()->create();
        $foreignProfile = OwnerProfile::factory()->create(['user_id' => $other->id, 'agency_id' => $agency->id]);

        Sanctum::actingAs($me);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => "owner:{$foreignProfile->id}",
        ])->assertStatus(403);
    }

    public function test_patch_active_profile_returns_403_for_unknown_id(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => 'owner:999999',
        ])->assertStatus(403);
    }

    public function test_patch_active_profile_validates_format(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => 'invalid-format',
        ])->assertStatus(422);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => 'unknown_type:1',
        ])->assertStatus(422);
    }

    public function test_patch_active_profile_requires_authentication(): void
    {
        $this->patchJson('/api/me/active-profile', ['profile_id' => 'owner:1'])
            ->assertStatus(401);
    }

    public function test_patch_active_profile_rejects_suspended_profile_with_403(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $suspended = AgentProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => AgentProfileStatus::Suspended,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => "agent:{$suspended->id}",
        ])->assertStatus(403);
    }

    /**
     * TCK — L'onboarding hôte épingle `agency_admin:<id>` comme profil actif
     * (HostIndividualOnboardingService), et `ActiveProfileResolver::TYPE_MAP`
     * connaît cet alias. La regex de `SelectActiveProfileRequest`, elle, ne le
     * listait pas : revenir sur son propre espace administrateur rendait 422
     * « The profile id field format is invalid ».
     */
    public function test_patch_active_profile_accepts_agency_admin_alias(): void
    {
        $user = User::factory()->create();
        $agency = Agency::factory()->create();
        $admin = AgencyAdminProfile::factory()->create([
            'user_id' => $user->id,
            'agency_id' => $agency->id,
            'status' => AgencyAdminProfileStatus::Active,
        ]);

        Sanctum::actingAs($user);

        $this->patchJson('/api/me/active-profile', [
            'profile_id' => "agency_admin:{$admin->id}",
        ])
            ->assertOk()
            ->assertJsonPath('data.id', "agency_admin:{$admin->id}")
            ->assertJsonPath('data.type', 'agency_admin');
    }

    /**
     * Le pendant de garde : chaque alias de `TYPE_MAP` doit franchir la
     * validation. C'est la forme qui attrape le PROCHAIN alias ajouté au
     * back sans que la regex suive — le défaut d'origine, pas son instance.
     */
    public function test_every_resolver_alias_passes_validation(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        foreach (array_keys(ActiveProfileResolver::TYPE_MAP) as $alias) {
            // 999999 n'existe pas : on attend 403 (résolution), jamais 422
            // (validation). Un 422 signerait un alias que la regex refuse.
            $this->patchJson('/api/me/active-profile', [
                'profile_id' => "{$alias}:999999",
            ])->assertStatus(403, "L'alias « {$alias} » est refusé par la validation.");
        }
    }
}
