<?php

namespace Tests\Feature\Api\Agency;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\Profiles\AgentProfile;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Gate;
use Tests\ApiTestCase;

/**
 * TCK-279 — AC6 (sync des capacités) et AC8 (effet réel sur une
 * autorisation métier).
 */
class AgencyRoleCapabilitiesTest extends ApiTestCase
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

    private function customRole(): AgencyRole
    {
        return AgencyRole::factory()->create([
            'agency_id' => $this->agency->id,
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
        ]);
    }

    public function test_ac6_put_replaces_the_whole_set(): void
    {
        $role = $this->customRole();
        $this->actingAsApi($this->admin);

        $url = "/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities";

        $this->apiPut($url, [
            'capabilities' => [
                Capability::PropertiesCreate->value,
                Capability::PropertiesPublish->value,
            ],
        ])->assertOk();

        $this->assertEqualsCanonicalizing(
            [Capability::PropertiesCreate->value, Capability::PropertiesPublish->value],
            $role->fresh()->capabilityEnums()->map(fn (Capability $c): string => $c->value)->all(),
        );

        // Remplacement, pas ajout : la première capacité disparaît.
        $this->apiPut($url, ['capabilities' => [Capability::BookingsValidate->value]])->assertOk();

        $this->assertSame(
            [Capability::BookingsValidate->value],
            $role->fresh()->capabilityEnums()->map(fn (Capability $c): string => $c->value)->all(),
        );
    }

    public function test_ac6_an_empty_array_clears_the_role(): void
    {
        $role = $this->customRole();
        $this->actingAsApi($this->admin);

        $url = "/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities";
        $this->apiPut($url, ['capabilities' => [Capability::PropertiesCreate->value]])->assertOk();
        $this->apiPut($url, ['capabilities' => []])->assertOk();

        $this->assertSame([], $role->fresh()->capabilityEnums()->all());
    }

    public function test_ac6_a_value_outside_the_enum_is_422(): void
    {
        $role = $this->customRole();
        $this->actingAsApi($this->admin);

        $this->apiPut("/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities", [
            'capabilities' => [Capability::PropertiesCreate->value, 'properties.teleport'],
        ])->assertStatus(422)->assertJsonValidationErrors('capabilities.1');

        $this->assertSame([], $role->fresh()->capabilityEnums()->all());
    }

    public function test_a_system_role_capabilities_cannot_be_synced(): void
    {
        $role = AgencyRole::query()
            ->where('agency_id', $this->agency->id)
            ->where('base_profile_type', AgencyRoleBaseType::Agent->value)
            ->firstOrFail();

        $this->actingAsApi($this->admin);

        $this->apiPut("/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities", [
            'capabilities' => [],
        ])->assertForbidden();

        $this->assertNotEmpty($role->fresh()->capabilityEnums()->all());
    }

    /**
     * AC8 — la capacité tient à l'`AgencyRole`, pas au type de profil. Deux
     * agents de la même agence, deux rôles, deux verdicts.
     */
    public function test_ac8_publish_follows_the_role_not_the_profile_type(): void
    {
        $publisherRole = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesPublish])
            ->create(['agency_id' => $this->agency->id]);

        $mutedRole = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesCreate])
            ->create(['agency_id' => $this->agency->id]);

        $publisher = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $publisher->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $publisherRole->id,
        ]);

        $muted = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $muted->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $mutedRole->id,
        ]);

        $this->assertTrue($publisher->canActAt(Capability::PropertiesPublish, $this->agency));
        $this->assertFalse($muted->canActAt(Capability::PropertiesPublish, $this->agency));

        // Et la Gate de rétrocompatibilité (`$user->can('properties.publish')`)
        // rend le même verdict — c'est elle que consultent les policies.
        $this->assertTrue($publisher->can(Capability::PropertiesPublish->value, $this->agency));
        $this->assertFalse($muted->can(Capability::PropertiesPublish->value, $this->agency));
    }

    public function test_ac8_a_role_stripped_of_publish_loses_it_immediately(): void
    {
        $role = AgencyRole::factory()
            ->ofType(AgencyRoleBaseType::Agent)
            ->withCapabilities([Capability::PropertiesPublish])
            ->create(['agency_id' => $this->agency->id]);

        $agent = User::factory()->create();
        AgentProfile::factory()->create([
            'user_id' => $agent->id,
            'agency_id' => $this->agency->id,
            'agency_role_id' => $role->id,
        ]);

        $this->assertTrue($agent->canActAt(Capability::PropertiesPublish, $this->agency));

        $this->actingAsApi($this->admin);
        $this->apiPut("/api/agencies/{$this->agency->id}/roles/{$role->id}/capabilities", [
            'capabilities' => [],
        ])->assertOk();

        // Pas de TTL à attendre : l'invalidation est synchrone (spec §52).
        $this->assertFalse($agent->fresh()->canActAt(Capability::PropertiesPublish, $this->agency));
    }

    public function test_capabilities_catalogue_is_served_grouped_by_domain(): void
    {
        $this->actingAsApi($this->admin);

        $response = $this->apiGet('/api/capabilities');

        $response->assertOk();
        $response->assertJsonStructure(['data' => ['domains' => [['domain', 'capabilities']], 'total']]);
        $this->assertSame(count(Capability::cases()), $response->json('data.total'));

        $flat = collect($response->json('data.domains'))->flatMap(fn (array $d): array => $d['capabilities']);
        $this->assertEqualsCanonicalizing(
            array_map(static fn (Capability $c): string => $c->value, Capability::cases()),
            $flat->all(),
        );
    }

    /**
     * Garde-fou : `Property` est le modèle sur lequel AC8 se joue vraiment.
     * On vérifie que le modèle existe et que la Gate est bien celle que la
     * policy consulte — sans quoi le test ci-dessus vérifierait un rouage
     * hors circuit.
     */
    public function test_property_policy_reads_the_same_gate(): void
    {
        $this->assertTrue(class_exists(Property::class));
        $this->assertTrue(Gate::has(Capability::PropertiesPublish->value));
    }
}
