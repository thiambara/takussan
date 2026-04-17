<?php

namespace Database\Factories;

use App\Models\Guarantor;
use Illuminate\Database\Eloquent\Factories\Factory;

class GuarantorFactory extends Factory
{
    protected $model = Guarantor::class;

    public function definition(): array
    {
        return [
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'phone' => '+221'.fake()->numerify('7########'),
            'email' => fake()->unique()->safeEmail(),
            'occupation' => fake()->jobTitle(),
            'employer' => fake()->company(),
            'monthly_income' => fake()->numberBetween(200_000, 3_000_000),
        ];
    }
}
