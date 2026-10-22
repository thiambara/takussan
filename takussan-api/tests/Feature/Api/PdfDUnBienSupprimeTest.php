<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * P130.02 (TCK-1250) — la quittance, le contrat et l'état des lieux signé d'un bail dont le bien a
 * été supprimé (suppression douce) se rendent encore : les trois gabarits lisent le bien supprimé.
 * Avant, ils rendaient 500 (« Attempt to read property "id" on null »).
 */
class PdfDUnBienSupprimeTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: User, 1: Customer, 2: Property, 3: Lease} */
    private function bailDontLeBienEstSupprime(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
        ]);

        return [$tenantUser, $tenant, $property, $lease];
    }

    private function assertPdf(TestResponse $response): void
    {
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $this->assertTrue(str_starts_with($response->getContent(), '%PDF-'));
    }

    public function test_la_quittance_d_un_bien_supprime_se_rend(): void
    {
        [$tenantUser, $tenant, $property, $lease] = $this->bailDontLeBienEstSupprime();
        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 400_000,
        ]);
        $property->delete();

        Sanctum::actingAs($tenantUser);

        $this->assertPdf($this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf"));
    }

    public function test_le_contrat_d_un_bien_supprime_se_rend(): void
    {
        [$tenantUser, , $property, $lease] = $this->bailDontLeBienEstSupprime();
        $property->delete();

        Sanctum::actingAs($tenantUser);

        $this->assertPdf($this->get("/api/leases/{$lease->id}/contract/pdf"));
    }

    public function test_l_etat_des_lieux_signe_d_un_bien_supprime_se_rend(): void
    {
        [$tenantUser, $tenant, $property, $lease] = $this->bailDontLeBienEstSupprime();
        $inventory = Inventory::factory()->signed()->create([
            'property_id' => $property->id,
            'lease_id' => $lease->id,
            'tenant_id' => $tenant->id,
            'conducted_by' => $lease->landlord_id,
        ]);
        $property->delete();

        Sanctum::actingAs($tenantUser);

        $this->assertPdf($this->get("/api/inventories/{$inventory->id}/pdf"));
    }
}
