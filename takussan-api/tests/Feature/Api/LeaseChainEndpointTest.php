<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseChainEndpointTest extends TestCase
{
    use RefreshDatabase;

    public function test_chain_returns_root_to_latest_in_order(): void
    {
        [$landlord, $root] = $this->scaffold();
        $service = app(LeaseRenewalService::class);

        $a1 = $service->renew($root, [
            'start_date' => $root->end_date->copy()->addDay()->toDateString(),
            'end_date' => $root->end_date->copy()->addYear()->toDateString(),
        ]);
        $a2 = $service->renew($a1, [
            'start_date' => $a1->end_date->copy()->addDay()->toDateString(),
            'end_date' => $a1->end_date->copy()->addYear()->toDateString(),
        ]);

        Sanctum::actingAs($landlord);

        $response = $this->getJson("/api/leases/{$a2->id}/chain")->assertOk();

        $ids = array_map(fn ($r) => (int) $r['id'], $response->json('data'));
        $this->assertSame([(int) $root->id, (int) $a1->id, (int) $a2->id], $ids);
    }

    public function test_chain_for_isolated_lease_returns_single_item(): void
    {
        [$landlord, $root] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $response = $this->getJson("/api/leases/{$root->id}/chain")->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertSame((int) $root->id, (int) $response->json('data.0.id'));
    }

    public function test_chain_403_for_cross_agency_user(): void
    {
        [, $root] = $this->scaffold();
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->getJson("/api/leases/{$root->id}/chain")->assertStatus(403);
    }

    public function test_chain_supports_sparse_fields(): void
    {
        [$landlord, $root] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $response = $this->getJson("/api/leases/{$root->id}/chain?fields[leases]=id,reference_number")
            ->assertOk();

        $first = $response->json('data.0');
        $this->assertArrayHasKey('id', $first);
        $this->assertArrayHasKey('reference_number', $first);
    }

    /**
     * @return array{0: User, 1: Lease}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $root = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYears(2),
            'end_date' => now()->subYear(),
        ]);

        return [$landlord, $root];
    }
}
