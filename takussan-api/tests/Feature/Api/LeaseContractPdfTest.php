<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-077 — lease contract PDF endpoint.
 */
class LeaseContractPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_generates_with_all_parties(): void
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 500_000,
            'deposit_amount' => 1_000_000,
        ]);

        // Attach 2 guarantors (business rule: up to 3)
        $g1 = Guarantor::factory()->create();
        $g2 = Guarantor::factory()->create();
        $lease->guarantors()->attach([$g1->id => ['role' => 'parent'], $g2->id => ['role' => 'employer']]);

        Sanctum::actingAs($landlord);

        $response = $this->get("/api/leases/{$lease->id}/contract/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'));
        // Sanity: some byte content per guarantor row → > 2KB is a reasonable floor
        $this->assertGreaterThan(2000, strlen($body));
    }

    public function test_le_locataire_du_bail_telecharge_son_contrat(): void
    {
        // TCK-593 (AC1) — le locataire, et non seulement le bailleur, obtient un PDF non vide.
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create(['tenant_id' => $tenant->id]);

        Sanctum::actingAs($tenantUser);

        $response = $this->get("/api/leases/{$lease->id}/contract/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');
        $this->assertTrue(str_starts_with($response->getContent(), '%PDF-'));
        $this->assertGreaterThan(2000, strlen($response->getContent()));
    }

    public function test_stranger_gets_403_on_lease_contract(): void
    {
        $landlord = User::factory()->create();
        $lease = Lease::factory()->create(['landlord_id' => $landlord->id]);

        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->get("/api/leases/{$lease->id}/contract/pdf")
            ->assertForbidden();
    }
}
