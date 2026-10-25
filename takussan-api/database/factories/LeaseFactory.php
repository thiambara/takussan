<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\LeaseType;
use App\Models\Enums\PaymentFrequency;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class LeaseFactory extends Factory
{
    protected $model = Lease::class;

    public function definition(): array
    {
        return [
            'property_id' => Property::factory(),
            'landlord_id' => User::factory(),
            'tenant_id' => Customer::factory(),
            'agency_id' => null,
            'reference_number' => 'LS-'.strtoupper(Str::random(8)),
            'type' => LeaseType::ResidentialRent,
            'status' => LeaseStatus::Draft,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'monthly_rent' => fake()->numberBetween(150_000, 1_500_000),
            'currency' => Currency::XOF,
            'deposit_amount' => fake()->numberBetween(150_000, 1_500_000),
            'commission_rate' => fake()->randomFloat(2, 5, 10),
            'payment_frequency' => PaymentFrequency::Monthly,
            'payment_day' => 5,
        ];
    }

    public function active(): static
    {
        return $this->state([
            'status' => LeaseStatus::Active,
            'signed_at' => now(),
        ]);
    }
}
