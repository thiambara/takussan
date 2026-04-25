<?php

namespace Tests\Feature\Jobs;

use App\Jobs\Lease\ApplyLateFeesJob;
use App\Models\Agency;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApplyLateFeesJobTest extends TestCase
{
    use RefreshDatabase;

    public function test_applies_fee_once_per_payment(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(7)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $job = new ApplyLateFeesJob;
        $first = app()->call([$job, 'handle']);
        $payment->refresh();

        $this->assertSame(1, $first);
        $this->assertSame('5000.00', (string) $payment->late_fee_amount);
        $this->assertNotNull($payment->late_fee_applied_at);
        $this->assertSame(PaymentStatus::Late, $payment->status);

        // Second run is a no-op: idempotence via late_fee_applied_at.
        $second = app()->call([$job, 'handle']);
        $this->assertSame(0, $second);
    }

    public function test_processes_multiple_agencies(): void
    {
        $agencyA = Agency::factory()->create();
        $agencyB = Agency::factory()->create();

        $leaseA = Lease::factory()->create([
            'agency_id' => $agencyA->id,
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 0,
        ]);
        $leaseB = Lease::factory()->create([
            'agency_id' => $agencyB->id,
            'late_fee_percent' => 10,
            'late_fee_grace_days' => 0,
        ]);

        $paymentA = LeasePayment::factory()->create([
            'lease_id' => $leaseA->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);
        $paymentB = LeasePayment::factory()->create([
            'lease_id' => $leaseB->id,
            'amount' => 200_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $applied = app()->call([new ApplyLateFeesJob, 'handle']);

        $this->assertSame(2, $applied);
        $this->assertSame('5000.00', (string) $paymentA->fresh()->late_fee_amount);
        $this->assertSame('20000.00', (string) $paymentB->fresh()->late_fee_amount);
    }

    public function test_skips_leases_without_late_fee_percent(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => null,
            'late_fee_grace_days' => 5,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(30)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $applied = app()->call([new ApplyLateFeesJob, 'handle']);

        $this->assertSame(0, $applied);
        $this->assertNull($payment->fresh()->late_fee_amount);
        $this->assertNull($payment->fresh()->late_fee_applied_at);
    }
}
