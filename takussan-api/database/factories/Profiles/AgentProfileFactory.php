<?php

namespace Database\Factories\Profiles;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class AgentProfileFactory extends Factory
{
    protected $model = AgentProfile::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'agency_id' => Agency::factory(),
            'status' => AgentProfileStatus::Active->value,
            'license_number' => strtoupper(fake()->bothify('AGT-#######')),
            'commission_rate' => fake()->randomFloat(2, 1, 15),
            'specialty' => fake()->randomElement(['residential', 'commercial', 'luxury', 'rental']),
            'hire_date' => fake()->dateTimeBetween('-5 years', '-1 month')->format('Y-m-d'),
            'active_until' => null,
            'metadata' => null,
        ];
    }

    public function inactive(): self
    {
        return $this->state(['status' => AgentProfileStatus::Inactive->value]);
    }

    public function suspended(): self
    {
        return $this->state(['status' => AgentProfileStatus::Suspended->value]);
    }
}
