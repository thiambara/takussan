<?php

namespace Tests\Feature\Api;

use App\Models\Guarantor;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LeaseGuarantorTest extends TestCase
{
    use RefreshDatabase;

    private function ownedLease(): array
    {
        $owner = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $owner->id]);
        $lease = Lease::factory()->create([
            'property_id' => $property->id,
            'landlord_id' => $owner->id,
        ]);

        return [$owner, $lease];
    }

    public function test_owner_can_attach_new_guarantor_inline(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Awa',
            'last_name' => 'Diop',
            'phone' => '+221771234567',
            'role' => 'primary',
        ])->assertCreated()
            ->assertJsonPath('data.guarantors_count', 1);

        $this->assertSame(1, $lease->guarantors()->count());
    }

    public function test_owner_can_attach_existing_guarantor_by_id(): void
    {
        [$owner, $lease] = $this->ownedLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertCreated()
            ->assertJsonPath('data.guarantor_id', $guarantor->id);
    }

    public function test_cannot_attach_more_than_three_guarantors(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        foreach (range(1, 3) as $i) {
            $this->postJson("/api/leases/{$lease->id}/guarantors", [
                'first_name' => "G{$i}",
                'last_name' => 'Ndiaye',
            ])->assertCreated();
        }

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'G4',
            'last_name' => 'Ndiaye',
        ])->assertStatus(422);
    }

    public function test_duplicate_attach_is_rejected(): void
    {
        [$owner, $lease] = $this->ownedLease();
        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);

        Sanctum::actingAs($owner);

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertCreated();
        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'guarantor_id' => $guarantor->id,
        ])->assertStatus(422);
    }

    public function test_owner_can_detach_guarantor(): void
    {
        [$owner, $lease] = $this->ownedLease();
        Sanctum::actingAs($owner);

        $guarantor = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $lease->guarantors()->attach($guarantor->id);

        $this->deleteJson("/api/leases/{$lease->id}/guarantors/{$guarantor->id}")
            ->assertOk()
            ->assertJsonPath('data.guarantors_count', 0);
    }

    public function test_random_user_cannot_attach_guarantor(): void
    {
        [, $lease] = $this->ownedLease();
        Sanctum::actingAs(User::factory()->create());

        $this->postJson("/api/leases/{$lease->id}/guarantors", [
            'first_name' => 'Ali',
            'last_name' => 'Test',
        ])->assertForbidden();
    }

    public function test_list_guarantors_returns_attached_set(): void
    {
        [$owner, $lease] = $this->ownedLease();
        $g1 = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $g2 = Guarantor::factory()->create(['added_by_id' => $owner->id]);
        $lease->guarantors()->attach([$g1->id, $g2->id]);

        Sanctum::actingAs($owner);
        $this->getJson("/api/leases/{$lease->id}/guarantors")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }
}
