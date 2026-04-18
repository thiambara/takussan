<?php

namespace Tests\Feature\Observers;

use App\Models\Agency;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeaseObserverTest extends TestCase
{
    use RefreshDatabase;

    public function test_updating_lease_status_updates_agency_active_leases_count(): void
    {
        $agency = Agency::factory()->create(['active_leases_count' => 0]);

        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Draft,
        ]);

        // Creating as Draft doesn't update count (because it only triggers on updated)

        $lease->update([
            'status' => LeaseStatus::Active,
        ]);

        $this->assertEquals(1, $agency->fresh()->active_leases_count);

        $lease->update([
            'status' => LeaseStatus::Terminated,
        ]);

        $this->assertEquals(0, $agency->fresh()->active_leases_count);
    }

    public function test_updating_other_fields_does_not_change_count(): void
    {
        $agency = Agency::factory()->create(['active_leases_count' => 0]);

        $lease = Lease::factory()->create([
            'agency_id' => $agency->id,
            'status' => LeaseStatus::Active,
        ]);

        // Manually trigger the count if we want to simulate proper state
        $agency->forceFill(['active_leases_count' => 1])->save();

        // Update unrelated field
        $lease->update([
            'terms' => 'New terms',
        ]);

        // The count shouldn't be touched (because observer bails if status not changed)
        $this->assertEquals(1, $agency->fresh()->active_leases_count);
    }
}
