<?php

namespace Database\Factories;

use App\Models\Property;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class ReviewFactory extends Factory
{
    protected $model = Review::class;

    public function definition(): array
    {
        return [
            'reviewable_type' => Property::class,
            'reviewable_id' => Property::factory(),
            'author_id' => User::factory(),
            'rating' => fake()->numberBetween(1, 5),
            'title' => fake()->sentence(4),
            'content' => fake()->paragraph(),
            'is_approved' => true,
            'approved_at' => now(),
        ];
    }
}
