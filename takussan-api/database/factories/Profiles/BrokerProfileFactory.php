<?php

namespace Database\Factories\Profiles;

use App\Models\Profiles\BrokerProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class BrokerProfileFactory extends Factory
{
    protected $model = BrokerProfile::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'license_number' => 'BRK-'.strtoupper(Str::random(8)),
            'insurance_policy_id' => 'INS-'.strtoupper(Str::random(8)),
            'regulator_registration' => 'REG-'.strtoupper(Str::random(6)),
            'active_until' => fake()->optional(0.7)->dateTimeBetween('+6 months', '+5 years')?->format('Y-m-d'),
            'metadata' => null,
        ];
    }
}
