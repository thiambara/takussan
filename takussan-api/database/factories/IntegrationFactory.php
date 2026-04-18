<?php

namespace Database\Factories;

use App\Models\Agency;
use Illuminate\Database\Eloquent\Factories\Factory;

class IntegrationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'provider' => $this->faker->randomElement(['stripe', 'twilio', 'google']),
            'agency_id' => Agency::factory(),
            'credentials' => json_encode(['api_key' => $this->faker->uuid()]),
            'is_active' => true,
            'last_used_at' => null,
            'metadata' => null,
        ];
    }
}
