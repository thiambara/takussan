<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
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
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

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
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

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
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

        $integration = Integration::factory()->create([
            'agency_id' => $agency->id,
            'is_active' => false,
        ]);

        Sanctum::actingAs($agencyAdmin);

        $this->postJson("/api/integrations/{$integration->id}/test")
            ->assertOk()
            ->assertJsonPath('data.ok', false);
    }

    public function test_list_accepts_metadata_in_sparse_fieldset(): void
    {
        // Regression (review): the admin UI requests
        // `fields[integrations]=...,metadata,...` — the column must be
        // in the allowedFields list (spatie throws 400 otherwise). Also
        // double-checks that `credentials` is never exposed by the resource.
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

        Integration::factory()->create([
            'agency_id' => $agency->id,
            'metadata' => ['notes' => 'prod'],
        ]);

        Sanctum::actingAs($agencyAdmin);

        $this->getJson('/api/integrations?fields[integrations]=id,provider,agency_id,is_active,last_used_at,metadata,created_at,updated_at')
            ->assertOk()
            ->assertJsonPath('data.0.metadata.notes', 'prod')
            ->assertJsonMissing(['credentials']);
    }

    /**
     * TCK-078 regression: make sure credentials land as a proper array
     * round-trip (no double-encoded JSON string). The previous controller
     * called json_encode() before handing the value to the encrypted:array
     * cast, so reads returned a stringified JSON blob instead of the
     * original payload.
     */
    public function test_credentials_are_stored_as_array_and_decrypt_once(): void
    {
        $agency = Agency::factory()->create();
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $agencyAdmin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $agencyAdmin->assignRole('agency_admin');
        $this->materializeRoleProfile($agencyAdmin, 'agency_admin', $agency);

        Sanctum::actingAs($agencyAdmin);

        $created = $this->postJson('/api/integrations', [
            'provider' => 'stripe',
            'credentials' => ['api_key' => 'sk_live_xyz', 'webhook_secret' => 'whsec_test'],
            'is_active' => true,
        ])->assertCreated();

        $integrationId = $created->json('data.id');
        $integration = Integration::findOrFail($integrationId);

        // The cast must surface a PHP array, not a JSON-encoded string.
        $this->assertIsArray($integration->credentials);
        $this->assertSame('sk_live_xyz', $integration->credentials['api_key']);
        $this->assertSame('whsec_test', $integration->credentials['webhook_secret']);

        // Also confirm the on-disk payload decrypts to exactly one layer
        // of JSON (array, not a string).
        $raw = DB::table('integrations')
            ->where('id', $integrationId)
            ->value('credentials');
        $decoded = json_decode(Crypt::decryptString($raw), true);
        $this->assertIsArray($decoded);
        $this->assertSame('sk_live_xyz', $decoded['api_key']);
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
        $this->materializeRoleProfile($agencyAdmin2, 'agency_admin', $agency2);

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
