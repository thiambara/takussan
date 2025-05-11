<?php

namespace Database\Factories;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Review>
 */
class ReviewFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $property = Property::inRandomOrder()->first();
        
        // If no property exists, create one
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        return [
            'model_id' => $property->id,
            'model_type' => Property::class,
            'user_id' => User::factory(),
            'rating' => fake()->randomFloat(1, 1, 5),
            'title' => fake()->sentence(),
            'content' => fake()->paragraph(3),
            'is_approved' => fake()->boolean(80),
            'approved_by' => fn (array $attributes) => $attributes['is_approved'] ? User::factory() : null,
            'approved_at' => fn (array $attributes) => $attributes['is_approved'] ? fake()->dateTimeBetween('-30 days', 'now') : null,
            'reported_count' => fake()->optional(0.1)->numberBetween(1, 10),
        ];
    }

    /**
     * Indicate that the review is approved.
     */
    public function approved(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'is_approved' => true,
                'approved_by' => User::factory(),
                'approved_at' => fake()->dateTimeBetween('-30 days', 'now'),
            ];
        });
    }

    /**
     * Indicate that the review is pending approval.
     */
    public function pending(): Factory
    {
        return $this->state(function (array $attributes) {
            return [
                'is_approved' => false,
                'approved_by' => null,
                'approved_at' => null,
            ];
        });
    }
    
    /**
     * Indicate that the review is for a property.
     */
    public function forProperty(Property $property = null): Factory
    {
        if (!$property) {
            $property = Property::factory()->create();
        }
        
        return $this->state(function (array $attributes) use ($property) {
            return [
                'model_id' => $property->id,
                'model_type' => Property::class,
            ];
        });
    }
}
