<?php

namespace Database\Factories;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\Enums\BookingStatus;
use App\Models\Enums\Currency;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class BookingFactory extends Factory
{
    protected $model = Booking::class;

    public function definition(): array
    {
        return [
            'property_id' => Property::factory(),
            'customer_id' => Customer::factory(),
            'created_by_id' => User::factory(),
            'agency_id' => null,
            'reference_number' => 'BK-'.strtoupper(Str::random(8)),
            'status' => BookingStatus::Pending,
            'total_amount' => fake()->numberBetween(50_000, 2_000_000),
            'deposit_amount' => fake()->numberBetween(25_000, 500_000),
            'currency' => Currency::XOF,
            'start_date' => now()->addDays(7)->toDateString(),
            'end_date' => now()->addDays(37)->toDateString(),
            'expires_at' => now()->addDays(7),
        ];
    }

    public function confirmed(): static
    {
        return $this->state([
            'status' => BookingStatus::Confirmed,
            'confirmed_at' => now(),
        ]);
    }

    public function cancelled(): static
    {
        return $this->state([
            'status' => BookingStatus::Cancelled,
            'cancelled_at' => now(),
        ]);
    }
}
