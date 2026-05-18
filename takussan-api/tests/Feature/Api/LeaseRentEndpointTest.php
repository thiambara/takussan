<?php

namespace Tests\Feature\Api;

use App\Models\Customer;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Spatie\Activitylog\Models\Activity;
use Tests\TestCase;

class LeaseRentEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_landlord_can_review_rent_on_active_lease(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $response = $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 220_000,
            'reason' => 'Annual rent review',
        ])->assertStatus(200);

        $this->assertSame(220_000.0, (float) $response->json('data.monthly_rent'));
        $this->assertDatabaseHas('leases', [
            'id' => $lease->id,
            'monthly_rent' => 220_000,
        ]);

        $log = Activity::query()
            ->where('event', 'lease_rent_reviewed')
            ->where('subject_id', $lease->id)
            ->first();
        $this->assertNotNull($log);
        $this->assertSame('Annual rent review', $log->properties['reason']);
    }

    public function test_short_reason_returns_422(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 210_000,
            'reason' => 'no',
        ])->assertStatus(422);
    }

    public function test_excessive_variation_without_force_returns_422(): void
    {
        [$landlord, $lease] = $this->scaffold();
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000, // +30 %
            'reason' => 'Big bump',
        ])->assertStatus(422);
    }

    public function test_excessive_variation_with_force_and_permission_returns_200(): void
    {
        [$landlord, $lease] = $this->scaffold();
        // TCK-278 — `leases.rent_review_force` est désormais réservé au
        // super_admin (bypass Gate::before). Promouvoir le landlord.
        $this->materializeRoleProfile($landlord, 'super_admin');
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Big bump',
            'force' => true,
        ])->assertStatus(200);
    }

    public function test_actor_with_rent_review_but_no_force_cannot_force(): void
    {
        // The `agent` role holds `leases.rent_review` but NOT
        // `leases.rent_review_force` (per RolesAndPermissionsSeeder).
        // We make this agent the landlord of the lease so the policy's
        // landlord short-circuit grants access; the force flag must
        // still be rejected at the service layer.
        $agent = User::factory()->create();

        $property = Property::factory()->create(['user_id' => $agent->id]);
        $tenant = Customer::factory()->create();
        $lease = Lease::factory()->active()->create([
            'landlord_id' => $agent->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        Sanctum::actingAs($agent);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 260_000,
            'reason' => 'Trying force',
            'force' => true,
        ])->assertStatus(422);
    }

    public function test_tenant_cannot_review_rent(): void
    {
        [, $lease, $tenantUser] = $this->scaffold();
        Sanctum::actingAs($tenantUser);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 210_000,
            'reason' => 'Tenant trying',
        ])->assertStatus(403);
    }

    public function test_stranger_cannot_review_rent(): void
    {
        [, $lease] = $this->scaffold();
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 210_000,
            'reason' => 'Stranger trying',
        ])->assertStatus(403);
    }

    public function test_review_on_draft_lease_returns_422(): void
    {
        [$landlord, $lease] = $this->scaffold();
        $lease->forceFill(['status' => 'draft'])->save();
        Sanctum::actingAs($landlord);

        $this->patchJson("/api/leases/{$lease->id}/rent", [
            'new_rent' => 210_000,
            'reason' => 'On draft',
        ])->assertStatus(422);
    }

    /**
     * @return array{0: User, 1: Lease, 2: User}
     */
    private function scaffold(): array
    {
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenantUser = User::factory()->create();
        $tenant = Customer::factory()->create(['user_id' => $tenantUser->id]);

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'monthly_rent' => 200_000,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
        ]);

        return [$landlord, $lease, $tenantUser];
    }
}
