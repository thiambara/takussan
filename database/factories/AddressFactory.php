<?php

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Address>
 */
class AddressFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition()
    {
        return [
            'address' => fake()->address(),
            'country' => fake()->country(),
            'state' => fake()->state(),
            'city' => fake()->city(),
            'district' => fake()->streetName(),
            'street' => fake()->streetAddress(),
            'postal_code' => fake()->postcode(),
            'building' => fake()->buildingNumber(),
            'latitude' => fake()->latitude(),
            'longitude' => fake()->longitude(),
            'metadata' => [],
        ];
    }
}
