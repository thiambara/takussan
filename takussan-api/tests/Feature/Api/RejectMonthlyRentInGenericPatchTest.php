<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * TCK-091 — `PATCH /api/leases/{lease}` is the generic late-fee
 * endpoint. Sending `monthly_rent` (or `sale_price`) in the payload
 * must be rejected with a 422 pointing the caller at the dedicated
 * rent-review endpoint, regardless of permissions.
 */
class RejectMonthlyRentInGenericPatchTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
    }

    public function test_generic_patch_rejects_monthly_rent_payload(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $response = $this->patchJson("/api/leases/{$lease->id}", [
            'monthly_rent' => 350_000,
        ])->assertStatus(422);

        $errors = $response->json('errors') ?? [];
        $this->assertArrayHasKey('monthly_rent', $errors);

        // The rent must NOT have changed.
        $this->assertEquals(200_000.0, (float) $lease->fresh()->monthly_rent);
    }

    public function test_generic_patch_rejects_sale_price_payload(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $response = $this->patchJson("/api/leases/{$lease->id}", [
            'sale_price' => 50_000_000,
        ])->assertStatus(422);

        // The error must point at the actual offending key so the
        // frontend can highlight the right field.
        $errors = $response->json('errors') ?? [];
        $this->assertArrayHasKey('sale_price', $errors);
        $this->assertArrayNotHasKey('monthly_rent', $errors);
    }

    public function test_generic_patch_still_accepts_late_fee_config(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/leases/{$lease->id}", [
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 7,
        ])->assertStatus(200);
    }

    /**
     * @return array{0: User, 1: Lease}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        return [$landlord, $lease];
    }
}
