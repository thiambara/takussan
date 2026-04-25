<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Lease\ConfirmEarlyTerminationsJob;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ConfirmEarlyTerminationsJobTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    public function test_confirms_terminating_leases_with_paid_penalty_past_effective_date(): void
    {
        $service = app(EarlyTerminationService::class);
        $actor = User::factory()->create();

        $lease = $this->makeLease($actor);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
        $lease = $lease->fresh();
        Invoice::find($lease->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();

        Carbon::setTestNow(now()->addDays(46));
        try {
            $count = (new ConfirmEarlyTerminationsJob)->handle($service);

            $this->assertSame(1, $count);
            $this->assertSame(LeaseStatus::Terminated, $lease->fresh()->status);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_skips_leases_with_unpaid_penalty(): void
    {
        $service = app(EarlyTerminationService::class);
        $actor = User::factory()->create();

        $lease = $this->makeLease($actor);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        Carbon::setTestNow(now()->addDays(46));
        try {
            $count = (new ConfirmEarlyTerminationsJob)->handle($service);

            $this->assertSame(0, $count);
            $this->assertSame(LeaseStatus::Terminating, $lease->fresh()->status);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_ignores_leases_before_effective_date(): void
    {
        $service = app(EarlyTerminationService::class);
        $actor = User::factory()->create();

        $lease = $this->makeLease($actor);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        $count = (new ConfirmEarlyTerminationsJob)->handle($service);

        $this->assertSame(0, $count);
        $this->assertSame(LeaseStatus::Terminating, $lease->fresh()->status);
    }

    public function test_is_idempotent_when_run_twice(): void
    {
        $service = app(EarlyTerminationService::class);
        $actor = User::factory()->create();

        $lease = $this->makeLease($actor);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
        $lease = $lease->fresh();
        Invoice::find($lease->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();

        Carbon::setTestNow(now()->addDays(46));
        try {
            (new ConfirmEarlyTerminationsJob)->handle($service);
            // Second run: lease is no longer `terminating`, so the query
            // returns 0 candidates — nothing flips.
            $count = (new ConfirmEarlyTerminationsJob)->handle($service);
            $this->assertSame(0, $count);
        } finally {
            Carbon::setTestNow();
        }
    }

    private function makeLease(User $landlord): Lease
    {
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        return Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 400_000,
        ]);
    }
}
