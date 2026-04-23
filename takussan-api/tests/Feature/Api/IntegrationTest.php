<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class IntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_agency_admin_can_manage_integrations(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');

        Sanctum::actingAs($agencyAdmin);

        $response = $this->postJson('/api/integrations', [
            'provider' => 'stripe',
            'credentials' => ['api_key' => 'sk_test_123'],
            'is_active' => true,
        ])->assertCreated()
            ->assertJsonPath('data.provider', 'stripe')
            ->assertJsonPath('data.agency_id', $agency->id)
            ->assertJsonMissing(['data.credentials']);

        $integrationId = $response->json('data.id');

        $this->putJson("/api/integrations/{$integrationId}", [
            'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->getJson('/api/integrations')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        $this->deleteJson("/api/integrations/{$integrationId}")
            ->assertNoContent();
    }

    public function test_test_endpoint_reports_ok_with_credentials(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');

        Sanctum::actingAs($agencyAdmin);

        // Create the integration through the public API so encryption/casts
        // use the same path as the UI — `test()` reads credentials back.
        $created = $this->postJson('/api/integrations', [
            'provider' => 'stripe',
            'credentials' => ['api_key' => 'sk_live_abc'],
            'is_active' => true,
        ])->assertCreated();

        $integrationId = $created->json('data.id');

        $this->postJson("/api/integrations/{$integrationId}/test")
            ->assertOk()
            ->assertJsonPath('data.ok', true);
    }

    public function test_test_endpoint_reports_ko_when_inactive(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');

        $integration = Integration::factory()->create([
            'agency_id' => $agency->id,
            'is_active' => false,
        ]);

        Sanctum::actingAs($agencyAdmin);

        $this->postJson("/api/integrations/{$integration->id}/test")
            ->assertOk()
            ->assertJsonPath('data.ok', false);
    }

    public function test_agency_admin_cannot_manage_other_agency_integrations(): void
    {
        $agency1 = Agency::factory()->create();
        $agency2 = Agency::factory()->create();

        $integration = Integration::factory()->create(['agency_id' => $agency1->id]);

        app(PermissionRegistrar::class)->setPermissionsTeamId($agency2->id);
        $agencyAdmin2 = User::factory()->create(['agency_id' => $agency2->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin2->assignRole('agency_admin');

        Sanctum::actingAs($agencyAdmin2);

        $this->getJson('/api/integrations')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->putJson("/api/integrations/{$integration->id}", [
            'is_active' => false,
        ])->assertForbidden();

        $this->deleteJson("/api/integrations/{$integration->id}")
            ->assertForbidden();
    }
}
