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
            'credentials' => ['api_key' => $this->faker->uuid()],
            'is_active' => true,
            'last_used_at' => null,
            'last_health_check_at' => null,
            'health_status' => 'unknown',
            'metadata' => null,
        ];
    }
}
