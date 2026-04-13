<?php

namespace Database\Factories;

use App\Models\Tag;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Tag>
 */
class TagFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->word();
        
        return [
            'name' => $name,
            'slug' => Str::slug($name),
            'description' => fake()->optional()->sentence(),
            'type' => fake()->randomElement(['property', 'customer', 'general']),
            'color' => fake()->hexColor()
        ];
    }

    /**
     * Indicate that the tag is specifically for properties.
     */
    public function forProperties(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'type' => 'property',
        ]);
    }

    /**
     * Indicate that the tag is specifically for customers.
     */
    public function forCustomers(): Factory
    {
        return $this->state(fn (array $attributes) => [
            'type' => 'customer',
        ]);
    }
}
