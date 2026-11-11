<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-2646 (ADR-0098 §6) — la voie sur place n'enlève rien au chemin existant : le locataire connecté
 * signe depuis son compte, par son seul tracé, sans code, numéro vérifié ou non.
 * (`InventorySignatureTest::test_tenant_can_sign_as_tenant_role` passe inchangé.)
 */
class InventoryTenantOwnSignatureUnchangedTest extends TestCase
{
    use RefreshDatabase;

    private const SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAvMBAOeufn4AAAAASUVORK5CYII=';

    /** @return array{0: User, 1: Inventory} */
    private function scaffold(array $tenantAttributes = []): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $tenantUser = User::factory()->create($tenantAttributes);
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create(['property_id' => $property->id, 'landlord_id' => $owner->id, 'tenant_id' => $tenant->id]);
        $inventory = Inventory::factory()->pendingSignature()->create([
            'lease_id' => $lease->id, 'property_id' => $property->id, 'tenant_id' => $tenant->id, 'conducted_by' => $owner->id,
        ]);

        return [$tenantUser, $inventory];
    }

    public function test_le_locataire_signe_depuis_son_compte_sans_code_et_la_voie_est_drawn(): void
    {
        Notification::fake();
        [$tenantUser, $inventory] = $this->scaffold(['phone_verified_at' => null]);

        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE])
            ->assertOk()
            ->assertJsonPath('data.tenant_signed', true)
            ->assertJsonPath('data.tenant_signature_method', 'drawn')
            ->assertJsonPath('data.tenant_signed_via_user_id', null)
            ->assertJsonPath('data.tenant_otp_destination', null);

        $this->assertNull($inventory->refresh()->tenant_signed_ip);
        Notification::assertNothingSent();
    }

    /** Un code posté par le locataire lui-même ne change pas la voie : il n'est ni exigé ni lu. */
    public function test_un_code_poste_par_le_locataire_est_ignore(): void
    {
        [$tenantUser, $inventory] = $this->scaffold();

        Sanctum::actingAs($tenantUser);
        $this->postJson("/api/inventories/{$inventory->id}/sign", ['role' => 'tenant', 'signature' => self::SIGNATURE, 'code' => '123456'])
            ->assertOk()
            ->assertJsonPath('data.tenant_signature_method', 'drawn');
    }
}
