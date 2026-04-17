<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\CustomerPipelineStage;
use App\Models\Enums\CustomerStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'user_id' => null,
            'agency_id' => null,
            'added_by_id' => null,
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => '+221'.fake()->numerify('7########'),
            'occupation' => fake()->jobTitle(),
            'status' => CustomerStatus::Active,
            'pipeline_stage' => CustomerPipelineStage::Lead,
        ];
    }
}
