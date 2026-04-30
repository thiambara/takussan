<?php

namespace Tests\Feature\Jobs;

use App\Jobs\GenerateLeasePaymentSchedule;
use App\Models\Enums\LeaseStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GenerateLeasePaymentScheduleTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_generates_schedule_if_no_payments_exist(): void
    {
        $lease = Lease::factory()->create([
            'start_date' => now()->startOfMonth(),
            'end_date' => now()->startOfMonth()->addMonths(3),
            'monthly_rent' => 100000,
            'status' => LeaseStatus::Active->value,
        ]);

        $this->assertEquals(0, LeasePayment::where('lease_id', $lease->id)->count());

        $job = new GenerateLeasePaymentSchedule($lease);
        app()->call([$job, 'handle']);

        $this->assertTrue(LeasePayment::where('lease_id', $lease->id)->count() > 0);
    }

    public function test_it_does_not_duplicate_schedule_if_already_generated(): void
    {
        $lease = Lease::factory()->create();
        LeasePayment::factory()->count(2)->create(['lease_id' => $lease->id]);

        $initialCount = LeasePayment::where('lease_id', $lease->id)->count();

        $job = new GenerateLeasePaymentSchedule($lease);
        app()->call([$job, 'handle']);

        $this->assertEquals($initialCount, LeasePayment::where('lease_id', $lease->id)->count());
    }
}
