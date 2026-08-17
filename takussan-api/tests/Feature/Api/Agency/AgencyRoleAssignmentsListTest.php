<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\ApiTestCase;

/**
 * TCK-279 — `GET /api/agencies/{agency}/role-assignments` (AC11).
 *
 * Ce que la console Équipe ne pouvait pas savoir avant cet endpoint :
 * quel PROFIL d'un utilisateur vit dans CETTE agence, et quel rôle il
 * porte. `UserResource` n'expose que les TYPES de profils.
 */
class AgencyRoleAssignmentsListTest extends ApiTestCase
{
    use RefreshDatabase;

    private Agency $agency;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->agency = Agency::factory()->create();
        $this->admin = User::factory()->create();
        AgencyAdminProfile::factory()->create([
            'user_id' => $this->admin->id,
            'agency_id' => $this->agency->id,
        ]);
    }

    private function url(array $userIds): string
    {
        $qs = http_build_query(['user_ids' => $userIds]);

        return "/api/agencies/{$this->agency->id}/role-assignments?{$qs}";
    }

    public function test_it_returns_the_profile_id_type_and_role_of_each_requested_member(): void
    {
        $agentUser = User::factory()->create();
        $agentProfile = AgentProfile::factory()->create([
            'user_id' => $agentUser->id,
            'agency_id' => $this->agency->id,
        ]);

        $this->actingAsApi($this->admin);

        $response = $this->apiGet($this->url([$agentUser->id]));

        $response->assertOk();
        $response->assertJsonCount(1, 'data');

        $row = $response->json('data.0');
        $this->assertSame($agentProfile->id, $row['profile_id']);
        $this->assertSame(AgencyRoleBaseType::Agent->value, $row['profile_type']);
        $this->assertSame($agentUser->id, $row['user_id']);
        // Le pointeur est posé par défaut sur le rôle système du type
        // (`HasAgencyRole::bootHasAgencyRole`), donc jamais nul.
        $this->assertSame(
            AgencyRoleBaseType::Agent->defaultRoleName(),
            $row['agency_role_name'],
        );
    }

    public function test_it_reflects_a_custom_role_rather_than_the_system_default(): void
    {
        $senior = AgencyRole::factory()->create([
            'agency_id' => $this->agency->id,
            'name' => 'Agent senior',
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'is_system' => false,
        ]);
        $agentUser = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agentUser->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $senior->id,
        ]);

        $this->actingAsApi($this->admin);

        $row = $this->apiGet($this->url([$agentUser->id]))->assertOk()->json('data.0');

        $this->assertSame($senior->id, $row['agency_role_id']);
        $this->assertSame('Agent senior', $row['agency_role_name']);
    }

    public function test_a_user_with_two_profiles_in_the_agency_yields_two_rows(): void
    {
        $both = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $both->id, 'agency_id' => $this->agency->id]);
        OwnerProfile::factory()->create(['user_id' => $both->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($this->admin);

        $data = $this->apiGet($this->url([$both->id]))->assertOk()->json('data');

        $this->assertCount(2, $data);
        $this->assertEqualsCanonicalizing(
            [AgencyRoleBaseType::Agent->value, AgencyRoleBaseType::Owner->value],
            array_column($data, 'profile_type'),
        );
    }

    public function test_it_does_not_leak_a_profile_from_another_agency(): void
    {
        $other = Agency::factory()->create();
        $stranger = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $stranger->id, 'agency_id' => $other->id]);

        $this->actingAsApi($this->admin);

        $this->apiGet($this->url([$stranger->id]))->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * La forme que le FRONT envoie réellement : `buildQueryString` sérialise
     * son échappatoire `extra` avec `String(value)`, donc un tableau y sort
     * en `3,7`. Sans le découpage côté serveur, la règle `array` refuserait
     * en 422 tous les appels de la console Équipe — et le test en `user_ids[]`
     * ci-dessus resterait vert.
     */
    public function test_it_accepts_the_comma_separated_form_the_frontend_sends(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $a->id, 'agency_id' => $this->agency->id]);
        OwnerProfile::factory()->create(['user_id' => $b->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($this->admin);

        $this->apiGet("/api/agencies/{$this->agency->id}/role-assignments?user_ids={$a->id},{$b->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_user_ids_is_required(): void
    {
        $this->actingAsApi($this->admin);

        $this->apiGet("/api/agencies/{$this->agency->id}/role-assignments")
            ->assertStatus(422)
            ->assertJsonValidationErrors('user_ids');
    }

    public function test_it_is_refused_to_a_plain_agent(): void
    {
        $agent = User::factory()->create();
        AgentProfile::factory()->create(['user_id' => $agent->id, 'agency_id' => $this->agency->id]);

        $this->actingAsApi($agent);

        $this->apiGet($this->url([$agent->id]))->assertForbidden();
    }
}
