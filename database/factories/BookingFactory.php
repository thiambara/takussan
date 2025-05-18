<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Booking>
 */
class BookingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $startDate = fake()->dateTimeBetween('-3 months', '+3 months');
        $endDate = fake()->dateTimeBetween($startDate, (clone $startDate)->modify('+30 days'));
        
        $statusOptions = ['pending', 'confirmed', 'completed', 'cancelled'];
        
        return [
            'customer_id' => Customer::factory(),
            'property_id' => Property::factory(),
            'user_id' => User::factory(),
            'start_date' => $startDate,
            'end_date' => $endDate,
            'status' => fake()->randomElement($statusOptions),
            'price' => fake()->numberBetween(10000, 500000),
            'notes' => fake()->optional(0.7)->paragraph(),
            'metadata' => []
        ];
    }
    
    /**
     * Indicate that the booking is pending.
     */
    public function pending(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'pending',
            ];
        });
    }
    
    /**
     * Indicate that the booking is confirmed.
     */
    public function confirmed(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'confirmed',
            ];
        });
    }
    
    /**
     * Indicate that the booking is completed.
     */
    public function completed(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'completed',
            ];
        });
    }
    
    /**
     * Indicate that the booking is cancelled.
     */
    public function cancelled(): static
    {
        return $this->state(function (array $attributes) {
            return [
                'status' => 'cancelled',
            ];
        });
    }
}
