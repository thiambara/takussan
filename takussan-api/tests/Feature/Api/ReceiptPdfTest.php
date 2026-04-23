<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-077 — receipt PDF endpoint.
 */
class ReceiptPdfTest extends TestCase
{
    use RefreshDatabase;

    public function test_tenant_can_download_own_receipt(): void
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

        $payment = LeasePayment::factory()->paid()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
            'amount' => 400_000,
        ]);

        Sanctum::actingAs($tenantUser);

        $response = $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf");
        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/pdf');

        $body = $response->getContent();
        $this->assertTrue(str_starts_with($body, '%PDF-'), 'Response must be a real PDF binary');
    }

    public function test_other_user_gets_403(): void
    {
        $landlord = User::factory()->create();
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);
        $lease = Lease::factory()->create([
            'landlord_id' => $landlord->id,
            'tenant_id' => $tenant->id,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'payer_id' => $tenant->id,
        ]);

        // An unrelated user
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->get("/api/leases/{$lease->id}/receipts/{$payment->id}/pdf")
            ->assertForbidden();
    }
}
