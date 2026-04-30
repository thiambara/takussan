<?php

namespace Database\Factories;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\Enums\BookingPaymentType;
use App\Models\Enums\Currency;
use App\Models\Enums\PaymentMethod;
use App\Models\Enums\PaymentStatus;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class BookingPaymentFactory extends Factory
{
    protected $model = BookingPayment::class;

    public function definition(): array
    {
        return [
            'booking_id' => Booking::factory(),
            'reference_number' => 'BPY-'.strtoupper(Str::random(6)),
            'amount' => fake()->numberBetween(10_000, 500_000),
            'currency' => Currency::XOF,
            'payment_method' => PaymentMethod::Wave,
            'payment_type' => BookingPaymentType::Deposit,
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
}
