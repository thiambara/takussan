<?php

namespace Tests\Feature\Services;

use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use App\Models\Setting;
use App\Services\Lease\LateFeeCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LateFeeCalculatorTest extends TestCase
{
    use RefreshDatabase;

    public function test_compute_returns_percent_of_remaining_amount_past_grace(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 5,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(10)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $this->assertSame(5000.0, app(LateFeeCalculator::class)->compute($payment->fresh()));
    }

    public function test_compute_returns_zero_when_within_grace(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => 5,
            'late_fee_grace_days' => 5,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(3)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $this->assertSame(0.0, app(LateFeeCalculator::class)->compute($payment->fresh()));
    }

    public function test_compute_uses_remaining_amount_for_partial_payment(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => 10,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(2)->toDateString(),
            'status' => PaymentStatus::PartiallyPaid,
            'metadata' => ['paid_amount' => 60_000],
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        // 10% × (100k − 60k) = 4 000.
        $this->assertSame(4000.0, app(LateFeeCalculator::class)->compute($payment->fresh()));
    }

    public function test_compute_returns_zero_when_percent_is_null_or_zero(): void
    {
        $lease = Lease::factory()->create([
            'late_fee_percent' => null,
            'late_fee_grace_days' => 5,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        $this->assertSame(0.0, app(LateFeeCalculator::class)->compute($payment->fresh()));

        $lease->update(['late_fee_percent' => 0]);
        $this->assertSame(0.0, app(LateFeeCalculator::class)->compute($payment->fresh()));
    }

    public function test_compute_clamps_to_setting_cap_percent(): void
    {
        Setting::create([
            'key' => 'late_fees.cap_percent',
            'value' => 3,
            'scope' => 'global',
        ]);

        $lease = Lease::factory()->create([
            'late_fee_percent' => 10,
            'late_fee_grace_days' => 0,
        ]);
        $payment = LeasePayment::factory()->create([
            'lease_id' => $lease->id,
            'amount' => 100_000,
            'due_date' => now()->subDays(15)->toDateString(),
            'status' => PaymentStatus::Pending,
            'late_fee_amount' => null,
            'late_fee_applied_at' => null,
        ]);

        // Raw 10% = 10 000, cap = 3% × 100k = 3 000.
        $this->assertSame(3000.0, app(LateFeeCalculator::class)->compute($payment->fresh()));
    }
}
