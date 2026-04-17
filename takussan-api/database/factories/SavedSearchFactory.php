<?php

namespace Database\Factories;

use App\Models\SavedSearch;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class SavedSearchFactory extends Factory
{
    protected $model = SavedSearch::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->sentence(3),
            'criteria' => ['price_max' => 500_000, 'bedrooms' => 2],
            'notification_frequency' => 'daily',
            'is_active' => true,
        ];
    }
}
