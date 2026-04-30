<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Database\Seeders\System\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseRenewalEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
    }

    public function test_landlord_can_renew_active_lease(): void
    {
        [$landlord, $lease] = $this->scaffold();
        $landlord->givePermissionTo('leases.renew');

        Sanctum::actingAs($landlord);

        $response = $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => $lease->end_date->copy()->addDay()->toDateString(),
            'end_date' => $lease->end_date->copy()->addYear()->toDateString(),
            'monthly_rent' => 450_000,
        ])->assertCreated();

        $this->assertSame((int) $response->json('data.renewed_from_lease_id'), (int) $lease->id);
        $this->assertSame('active', $response->json('data.status'));
        $this->assertSame(LeaseStatus::Renewed->value, $lease->fresh()->status->value);
    }

    public function test_renew_with_active_child_returns_422(): void
    {
        [$landlord, $lease] = $this->scaffold();
        $landlord->givePermissionTo('leases.renew');
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => $lease->end_date->copy()->addDay()->toDateString(),
        ])->assertCreated();

        // Re-attempting on the same (now Renewed) parent must fail.
        $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => now()->addYears(2)->toDateString(),
        ])->assertStatus(422);
    }

    public function test_renew_inherits_monthly_rent_when_omitted(): void
    {
        [$landlord, $lease] = $this->scaffold();
        $landlord->givePermissionTo('leases.renew');
        Sanctum::actingAs($landlord);

        $response = $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => $lease->end_date->copy()->addDay()->toDateString(),
        ])->assertCreated();

        $this->assertEquals((float) $lease->monthly_rent, (float) $response->json('data.monthly_rent'));
    }

    public function test_renew_rejects_tenant_or_property_mutation(): void
    {
        [$landlord, $lease] = $this->scaffold();
        $landlord->givePermissionTo('leases.renew');
        $otherTenant = Customer::factory()->create();
        Sanctum::actingAs($landlord);

        $this->postJson("/api/leases/{$lease->id}/renew", [
            'tenant_id' => $otherTenant->id,
            'start_date' => $lease->end_date->copy()->addDay()->toDateString(),
        ])->assertStatus(422);
    }

    public function test_renew_returns_403_when_user_lacks_permission(): void
    {
        [, $lease] = $this->scaffold();
        // Cross-agency landlord without renew perm.
        $stranger = User::factory()->create();
        $stranger->assignRole('agent'); // agent has renew via seeder, so revoke
        $stranger->revokePermissionTo('leases.renew');
        Sanctum::actingAs($stranger);

        $this->postJson("/api/leases/{$lease->id}/renew", [
            'start_date' => $lease->end_date->copy()->addDay()->toDateString(),
        ])->assertStatus(403);
    }

    /**
     * @return array{0: User, 1: Lease}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $landlord->assignRole('owner');
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYear(),
            'end_date' => now(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
        ]);

        return [$landlord, $lease];
    }
}
