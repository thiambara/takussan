<?php

namespace Tests\Feature\Services;

use App\Events\Lease\LeaseRenewed;
use App\Models\Customer;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\LeaseRenewalService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class LeaseRenewalServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_renew_creates_chained_child_with_inherited_fields(): void
    {
        Event::fake();
        [$service, $parent] = $this->scaffold();

        $child = $service->renew($parent, [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
            'end_date' => $parent->end_date->copy()->addYear()->toDateString(),
        ]);

        $this->assertSame($parent->id, $child->renewed_from_lease_id);
        $this->assertSame($parent->property_id, $child->property_id);
        $this->assertSame($parent->tenant_id, $child->tenant_id);
        $this->assertEquals((float) $parent->monthly_rent, (float) $child->monthly_rent);
        $this->assertSame(LeaseStatus::Renewed, $parent->fresh()->status);
        $this->assertSame(LeaseStatus::Active, $child->status);

        Event::assertDispatched(LeaseRenewed::class);
    }

    public function test_renew_overrides_only_provided_fields(): void
    {
        [$service, $parent] = $this->scaffold();

        $child = $service->renew($parent, [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
            'monthly_rent' => 999_999,
        ]);

        $this->assertEquals(999_999.00, (float) $child->monthly_rent);
        // deposit_amount not provided → inherited
        $this->assertEquals((float) $parent->deposit_amount, (float) $child->deposit_amount);
    }

    public function test_renew_rejects_when_parent_status_not_renewable(): void
    {
        [$service, $parent] = $this->scaffold();
        $parent->forceFill(['status' => LeaseStatus::Terminated])->save();

        $this->expectException(ValidationException::class);
        $service->renew($parent, [
            'start_date' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_renew_rejects_when_active_child_already_exists(): void
    {
        [$service, $parent] = $this->scaffold();

        $service->renew($parent, [
            'start_date' => $parent->end_date->copy()->addDay()->toDateString(),
        ]);

        // Re-renewing the same parent must fail (parent was flipped to Renewed,
        // and even if it were Active, an active child blocks).
        $this->expectException(ValidationException::class);
        $service->renew($parent->fresh(), [
            'start_date' => now()->addYears(2)->toDateString(),
        ]);
    }

    public function test_renew_rejects_tenant_mutation(): void
    {
        [$service, $parent] = $this->scaffold();
        $newTenant = Customer::factory()->create();

        $this->expectException(ValidationException::class);
        $service->renew($parent, [
            'tenant_id' => $newTenant->id,
            'start_date' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_renew_rejects_property_mutation(): void
    {
        [$service, $parent] = $this->scaffold();
        $newProperty = Property::factory()->create();

        $this->expectException(ValidationException::class);
        $service->renew($parent, [
            'property_id' => $newProperty->id,
            'start_date' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_renew_rejects_when_end_date_before_inherited_start_date(): void
    {
        // Si end_date est fourni sans start_date, le service hérite
        // start_date = parent.end_date + 1. Le FormRequest's `after:start_date`
        // ne peut pas valider ce cas (start_date n'est pas dans le payload),
        // donc le service doit lever 422 lui-même.
        [$service, $parent] = $this->scaffold();

        $this->expectException(ValidationException::class);
        $service->renew($parent, [
            // parent.end_date = now() ; inherited start_date = now()+1
            // end_date = now() est antérieur → invalid
            'end_date' => now()->toDateString(),
        ]);
    }

    public function test_renew_enforces_max_chain_depth(): void
    {
        $service = app(LeaseRenewalService::class);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $current = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYears(10),
            'end_date' => now()->subYears(9),
        ]);

        // Build 9 renewals → chain depth 10. The 10th renewal should be rejected.
        for ($i = 1; $i <= 9; $i++) {
            $current = $service->renew($current, [
                'start_date' => now()->subYears(10 - $i)->addDay()->toDateString(),
                'end_date' => now()->subYears(9 - $i)->toDateString(),
            ]);
        }

        $this->expectException(ValidationException::class);
        $service->renew($current, [
            'start_date' => now()->addDay()->toDateString(),
        ]);
    }

    public function test_chain_returns_full_history_in_order(): void
    {
        $service = app(LeaseRenewalService::class);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $root = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYears(3),
            'end_date' => now()->subYears(2),
        ]);
        $a1 = $service->renew($root, [
            'start_date' => now()->subYears(2)->addDay()->toDateString(),
            'end_date' => now()->subYear()->toDateString(),
        ]);
        $a2 = $service->renew($a1, [
            'start_date' => now()->subYear()->addDay()->toDateString(),
            'end_date' => now()->toDateString(),
        ]);

        $chain = $service->chain($a2);
        $this->assertCount(3, $chain);
        $this->assertSame($root->id, $chain[0]->id);
        $this->assertSame($a1->id, $chain[1]->id);
        $this->assertSame($a2->id, $chain[2]->id);

        // Same chain whether queried from root, mid, or leaf.
        $this->assertSame(
            $chain->pluck('id')->all(),
            $service->chain($root)->pluck('id')->all(),
        );
    }

    /**
     * @return array{0: LeaseRenewalService, 1: Lease}
     */
    private function scaffold(): array
    {
        $service = app(LeaseRenewalService::class);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();
        $parent = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subYear(),
            'end_date' => now(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 3,
            'terms' => 'Original lease terms',
        ]);

        return [$service, $parent];
    }
}
