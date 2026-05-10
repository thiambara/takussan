<?php

namespace Database\Factories\Profiles;

use App\Models\Agency;
use App\Models\Enums\AgentProfileStatus;
use App\Models\Profiles\AgentProfile;
use App\Models\User;
use App\Services\Invitation\AgentInvitationService;
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

    /**
     * TCK-258 — draft profile (no User attached yet, status = draft).
     * Mirrors the shape created by {@see AgentInvitationService::invite()}.
     */
    public function draft(): self
    {
        return $this->state([
            'user_id' => null,
            'status' => AgentProfileStatus::Draft->value,
            'license_number' => null,
            'commission_rate' => null,
            'specialty' => null,
            'hire_date' => null,
            'metadata' => [
                'email' => fake()->unique()->safeEmail(),
                'first_name' => fake()->firstName(),
                'last_name' => fake()->lastName(),
                'phone' => fake()->e164PhoneNumber(),
                'invited_role' => 'agent',
            ],
        ]);
    }
}
