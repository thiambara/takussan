<?php

namespace Database\Factories;

use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Property>
 */
class PropertyFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $propertyTypes = ['apartment', 'house', 'villa', 'land', 'office', 'store'];
        $statusOptions = ['available', 'sold', 'rented', 'under_maintenance', 'unavailable'];
        $visibilityOptions = ['public', 'private', 'unlisted'];
        $contractTypes = ['sale', 'rent', 'lease'];

        return [
            'user_id' => User::factory(),
            'agency_id' => null, // Can be overridden or inferred from user
            'title' => fake()->sentence(3),
            'description' => fake()->paragraph(3),
            'type' => fake()->randomElement($propertyTypes),
            'status' => fake()->randomElement($statusOptions),
            'visibility' => fake()->randomElement($visibilityOptions),
            'price' => fake()->numberBetween(50000, 5000000),
            'area' => fake()->numberBetween(20, 1000),
            'position' => null,
            'level' => fake()->optional()->numberBetween(0, 10),
            'title_type' => fake()->optional()->randomElement(['freehold', 'leasehold', 'other']),
            'with_administrative_monitoring' => fake()->boolean(),
            'contract_type' => fake()->randomElement($contractTypes),
            'servicing' => fake()->optional()->randomElements(['water', 'electricity', 'internet', 'security', 'cleaning'], rand(0, 5)),
            'metadata' => []
        ];
    }

    /**
     * Indicate that the property is available.
     *
     * @return Factory
     */
    public function available(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'available',
        ]);
    }

    /**
     * Indicate that the property is for sale.
     *
     * @return Factory
     */
    public function forSale(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'contract_type' => 'sale',
            'status' => 'available',
        ]);
    }

    /**
     * Indicate that the property is for rent.
     *
     * @return Factory
     */
    public function forRent(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'contract_type' => 'rent',
            'status' => 'available',
        ]);
    }
}
