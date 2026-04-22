<?php

namespace Tests\Feature\Services;

use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Services\Model\LeaseLateFeeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeaseLateFeeServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_calculate_returns_zero_when_not_overdue(): void
    {
        $lease = Lease::factory()->create();
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->addDays(2)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);

        $this->assertSame(0.0, (new LeaseLateFeeService)->calculate($payment));
    }

    public function test_calculate_returns_zero_within_grace_period(): void
    {
        $lease = Lease::factory()->create();
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);

        $service = new LeaseLateFeeService(rate: 0.05, graceDays: 5);
        $this->assertSame(0.0, $service->calculate($payment));
    }

    public function test_calculate_returns_rate_times_amount_when_past_grace(): void
    {
        $lease = Lease::factory()->create();
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(10)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);

        $service = new LeaseLateFeeService(rate: 0.05, graceDays: 5);
        $this->assertSame(5000.0, $service->calculate($payment));
    }

    public function test_apply_sets_late_fee_and_status(): void
    {
        $lease = Lease::factory()->create();
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(10)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);

        $service = new LeaseLateFeeService(rate: 0.05, graceDays: 5);
        $applied = $service->apply($payment);

        $this->assertSame(5000.0, $applied);
        $payment->refresh();
        $this->assertSame('5000.00', (string) $payment->late_fee);
        $this->assertSame(PaymentStatus::Late, $payment->status);
    }

    public function test_apply_is_idempotent(): void
    {
        $lease = Lease::factory()->create();
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(10)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);

        $service = new LeaseLateFeeService(rate: 0.05, graceDays: 5);
        $service->apply($payment);

        // Second application must be a no-op
        $second = $service->apply($payment->refresh());
        $this->assertSame(0.0, $second);
    }

    public function test_apply_all_sweeps_overdue_pending_payments(): void
    {
        $lease = Lease::factory()->create();

        $overdue = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 50_000,
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);
        $withinGrace = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 50_000,
            'due_date' => now()->subDays(2)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee' => null,
        ]);
        $paid = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 50_000,
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => PaymentStatus::Paid,
            'late_fee' => null,
        ]);

        $service = new LeaseLateFeeService(rate: 0.05, graceDays: 5);
        $count = $service->applyAll();

        $this->assertSame(1, $count);
        $this->assertSame('2500.00', (string) $overdue->fresh()->late_fee);
        $this->assertNull($withinGrace->fresh()->late_fee);
        $this->assertNull($paid->fresh()->late_fee);
    }
}
