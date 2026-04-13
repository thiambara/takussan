<?php

namespace Database\Factories;

use App\Models\Booking;
use App\Models\BookingPayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BookingPayment>
 */
class BookingPaymentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $paymentMethods = ['cash', 'bank_transfer', 'credit_card', 'mobile_money', 'cheque'];
        $paymentTypes = ['deposit', 'installment', 'final_payment', 'full_payment'];
        $statuses = ['pending', 'confirmed', 'failed', 'refunded'];
        
        return [
            'booking_id' => Booking::factory(),
            'user_id' => User::factory(),
            'amount' => fake()->randomFloat(2, 50000, 1000000),
            'payment_method' => fake()->randomElement($paymentMethods),
            'payment_type' => fake()->randomElement($paymentTypes),
            'transaction_id' => fake()->optional()->uuid(),
            'status' => fake()->randomElement($statuses),
            'payment_date' => fake()->dateTimeBetween('-1 year', 'now'),
            'confirmed_date' => function (array $attributes) {
                return $attributes['status'] === 'confirmed' 
                    ? fake()->dateTimeBetween($attributes['payment_date'], 'now') 
                    : null;
            },
            'receipt_number' => fake()->optional()->numerify('RCP-######'),
            'notes' => fake()->optional()->sentence(),
            'metadata' => []
        ];
    }

    /**
     * Indicate that the payment is confirmed.
     *
     * @return Factory
     */
    public function confirmed(): Factory
    {
        return $this->state(function (array $attributes) {
            $paymentDate = fake()->dateTimeBetween('-1 year', 'now');
            
            return [
                'status' => 'confirmed',
                'payment_date' => $paymentDate,
                'confirmed_date' => fake()->dateTimeBetween($paymentDate, 'now'),
                'receipt_number' => fake()->numerify('RCP-######'),
            ];
        });
    }

    /**
     * Indicate that the payment is a deposit payment.
     *
     * @return Factory
     */
    public function deposit(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'payment_type' => 'deposit',
        ]);
    }
}
