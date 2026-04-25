<?php

namespace Tests\Feature\Services;

use App\Events\Lease\LeaseEarlyTerminationCancelled;
use App\Events\Lease\LeaseEarlyTerminationConfirmed;
use App\Events\Lease\LeaseEarlyTerminationRequested;
use App\Models\Customer;
use App\Models\Enums\InvoiceStatus;
use App\Models\Enums\LeaseStatus;
use App\Models\Invoice;
use App\Models\Lease;
use App\Models\Property;
use App\Models\Setting;
use App\Models\User;
use App\Services\Lease\EarlyTerminationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class EarlyTerminationServiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // The listener calls `Notification::send($tenant, $landlord)`. Since
        // the landlord is always a real User in these scaffolds and the
        // project doesn't ship the default Laravel `notifications` table,
        // we fake the facade here to keep the listener body exercised without
        // hitting the missing table.
        Notification::fake();
    }

    public function test_request_creates_pending_invoice_and_flips_to_terminating(): void
    {
        Event::fake();
        [$service, $lease, $actor] = $this->scaffold();

        $effective = now()->addDays(45)->toDateString();

        $result = $service->request($lease, $actor, [
            'effective_date' => $effective,
            'reason' => 'Job relocation',
        ]);

        $this->assertSame(LeaseStatus::Terminating, $result->status);
        $this->assertSame($effective, $result->early_termination_effective_date->toDateString());
        $this->assertSame(EarlyTerminationService::DEFAULT_NOTICE_DAYS, $result->notice_period_days);
        $this->assertNotNull($result->early_termination_invoice_id);
        // 6 months remaining at 400 000 × 2 default penalty months = 800 000.
        $this->assertEquals(800_000.00, (float) $result->early_termination_penalty_amount);

        $invoice = Invoice::find($result->early_termination_invoice_id);
        $this->assertNotNull($invoice);
        $this->assertSame(InvoiceStatus::Sent, $invoice->status);
        $this->assertEquals(800_000.00, (float) $invoice->total_amount);

        Event::assertDispatched(LeaseEarlyTerminationRequested::class);
    }

    public function test_request_rejects_when_notice_period_too_short(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        // notice_period_days defaults to 30 — anything before today+30 must
        // fail with 422.
        $this->expectException(ValidationException::class);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(10)->toDateString(),
        ]);
    }

    public function test_request_rejects_when_already_terminating(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        $this->expectException(ValidationException::class);
        $service->request($lease->fresh(), $actor, [
            'effective_date' => now()->addDays(60)->toDateString(),
        ]);
    }

    public function test_request_rejects_when_status_not_active_or_expired(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        $lease->forceFill(['status' => LeaseStatus::Draft])->save();

        $this->expectException(ValidationException::class);
        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
    }

    public function test_request_rejects_when_effective_date_after_end_date(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $this->expectException(ValidationException::class);
        // Lease ends in 6 months (default scaffold) — try a date past it.
        $service->request($lease, $actor, [
            'effective_date' => now()->addYears(2)->toDateString(),
        ]);
    }

    public function test_compute_penalty_caps_at_remaining_months(): void
    {
        [$service, $lease] = $this->scaffold();

        // 1 day before end → less than 1 month remaining → cap at 1 month
        // (instead of 2 from the default Setting).
        $effective = Carbon::parse($lease->end_date)->subDay();
        $penalty = $service->computePenalty($lease, $effective);

        $this->assertEquals(400_000.00, $penalty);
    }

    public function test_compute_penalty_is_zero_when_after_end_date(): void
    {
        [$service, $lease] = $this->scaffold();

        $effective = Carbon::parse($lease->end_date)->addDay();
        $this->assertSame(0.0, $service->computePenalty($lease, $effective));
    }

    public function test_setting_overrides_default_penalty_months(): void
    {
        [$service, $lease, $actor] = $this->scaffold();
        Setting::create([
            'key' => EarlyTerminationService::SETTING_KEY,
            'value' => ['value' => 4],
            'scope' => 'global',
        ]);

        $result = $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        // 6 months remaining capped at setting=4 × 400 000 = 1 600 000.
        $this->assertEquals(1_600_000.00, (float) $result->early_termination_penalty_amount);
    }

    public function test_cancel_reverts_to_active_and_voids_invoice(): void
    {
        Event::fake();
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        $cancelled = $service->cancel($lease->fresh(), $actor);

        $this->assertSame(LeaseStatus::Active, $cancelled->status);
        $this->assertNull($cancelled->early_termination_requested_at);
        $this->assertNull($cancelled->early_termination_effective_date);
        $this->assertNull($cancelled->early_termination_invoice_id);

        Event::assertDispatched(LeaseEarlyTerminationCancelled::class);
    }

    public function test_cancel_rejects_when_penalty_paid(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
        $lease = $lease->fresh();
        Invoice::find($lease->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();

        $this->expectException(ValidationException::class);
        $service->cancel($lease, $actor);
    }

    public function test_confirm_rejects_when_invoice_unpaid(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
        $lease = $lease->fresh();

        // Travel past effective_date so the only blocker is the unpaid
        // invoice.
        Carbon::setTestNow(now()->addDays(46));
        try {
            $this->expectException(ValidationException::class);
            $service->confirm($lease, $actor);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_confirm_flips_to_terminated_when_invoice_paid_and_date_reached(): void
    {
        Event::fake();
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);
        $lease = $lease->fresh();
        Invoice::find($lease->early_termination_invoice_id)
            ->forceFill(['status' => InvoiceStatus::Paid])->save();

        Carbon::setTestNow(now()->addDays(46));
        try {
            $confirmed = $service->confirm($lease->fresh(), $actor);
            $this->assertSame(LeaseStatus::Terminated, $confirmed->status);
            $this->assertNotNull($confirmed->terminated_at);
            $this->assertSame($actor->id, $confirmed->terminated_by_id);
            Event::assertDispatched(LeaseEarlyTerminationConfirmed::class);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_confirm_rejects_before_effective_date(): void
    {
        [$service, $lease, $actor] = $this->scaffold();

        $service->request($lease, $actor, [
            'effective_date' => now()->addDays(45)->toDateString(),
        ]);

        $this->expectException(ValidationException::class);
        $service->confirm($lease->fresh(), $actor);
    }

    /**
     * @return array{0: EarlyTerminationService, 1: Lease, 2: User}
     */
    private function scaffold(): array
    {
        $service = app(EarlyTerminationService::class);
        $landlord = User::factory()->create();
        $property = Property::factory()->create(['user_id' => $landlord->id]);
        $tenant = Customer::factory()->create();

        $lease = Lease::factory()->active()->create([
            'landlord_id' => $landlord->id,
            'property_id' => $property->id,
            'tenant_id' => $tenant->id,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'monthly_rent' => 400_000,
            'deposit_amount' => 800_000,
        ]);

        return [$service, $lease, $landlord];
    }
}
