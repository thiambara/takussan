<?php

namespace Tests\Feature\Api;

use App\Models\Agency;
use App\Models\Integration;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-110 — Edit-mode metadata semantics. Sending `metadata: {}`
 * MUST clear the previously stored metadata (PUT semantics) so a
 * field cleared in the form actually disappears server-side.
 * Omitting the key entirely from the body MUST leave metadata
 * untouched.
 */
class IntegrationMetadataEditTest extends TestCase
{
    use RefreshDatabase;

    private function agencyAdmin(Agency $agency): User
    {
        app(PermissionRegistrar::class)->setPermissionsTeamId($agency->id);
        $admin = User::factory()->create(['agency_id' => $agency->id]);
        Role::findOrCreate('agency_admin');
        $admin->assignRole('agency_admin');
        $this->materializeRoleProfile($admin, 'agency_admin', $agency);

        return $admin;
    }

    public function test_empty_metadata_payload_clears_stored_metadata(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs($this->agencyAdmin($agency));
        $integration = Integration::create([
            'provider' => 'sms_mtarget',
            'agency_id' => $agency->id,
            'credentials' => ['username' => 'u', 'password' => 'p'],
            'metadata' => ['notes' => 'old notes', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);

        $this->putJson("/api/integrations/{$integration->id}", [
            'metadata' => (object) [], // sent as empty object on the wire
        ])->assertOk();

        $integration->refresh();
        $this->assertSame([], (array) $integration->metadata);
    }

    public function test_omitting_metadata_preserves_stored_metadata(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs($this->agencyAdmin($agency));
        $integration = Integration::create([
            'provider' => 'sms_mtarget',
            'agency_id' => $agency->id,
            'credentials' => ['username' => 'u', 'password' => 'p'],
            'metadata' => ['notes' => 'keep me', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);

        $this->putJson("/api/integrations/{$integration->id}", [
            'is_active' => false,
        ])->assertOk();

        $integration->refresh();
        $this->assertSame('keep me', $integration->metadata['notes'] ?? null);
        $this->assertSame('TAKUSSAN', $integration->metadata['sender_id'] ?? null);
    }

    public function test_partial_metadata_replaces_entirely(): void
    {
        $agency = Agency::factory()->create();
        Sanctum::actingAs($this->agencyAdmin($agency));
        $integration = Integration::create([
            'provider' => 'sms_mtarget',
            'agency_id' => $agency->id,
            'credentials' => ['username' => 'u', 'password' => 'p'],
            'metadata' => ['notes' => 'old', 'sender_id' => 'TAKUSSAN'],
            'is_active' => true,
        ]);

        // Replacement: only `sender_id` survives, `notes` is gone.
        $this->putJson("/api/integrations/{$integration->id}", [
            'metadata' => ['sender_id' => 'TAKUSSAN'],
        ])->assertOk();

        $integration->refresh();
        $this->assertSame('TAKUSSAN', $integration->metadata['sender_id'] ?? null);
        $this->assertArrayNotHasKey('notes', $integration->metadata ?? []);
    }
}
