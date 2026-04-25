<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeasePaymentType;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use App\Models\Lease;
use App\Models\LeasePayment;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class LeasePaymentFactory extends Factory
{
    protected $model = LeasePayment::class;

    public function definition(): array
    {
        $start = now()->startOfMonth();

        return [
            'lease_id' => Lease::factory(),
            'payer_id' => Customer::factory(),
            'reference_number' => 'LPY-'.strtoupper(Str::random(6)),
            'amount' => fake()->numberBetween(50_000, 1_000_000),
            'currency' => Currency::XOF,
            'payment_method' => PaymentMethod::Wave,
            'payment_type' => LeasePaymentType::Rent,
            'period_start' => $start->toDateString(),
            'period_end' => $start->copy()->endOfMonth()->toDateString(),
            'due_date' => $start->copy()->addDays(5)->toDateString(),
            'status' => PaymentStatus::Pending,
        ];
    }

    public function paid(): static
    {
        return $this->state([
            'status' => PaymentStatus::Paid,
            'paid_at' => now(),
        ]);
    }

    public function late(): static
    {
        return $this->state([
            'status' => PaymentStatus::Late,
            'due_date' => now()->subDays(10)->toDateString(),
            'late_fee_amount' => 15_000,
            'late_fee_applied_at' => now()->subDays(2),
        ]);
    }
}
