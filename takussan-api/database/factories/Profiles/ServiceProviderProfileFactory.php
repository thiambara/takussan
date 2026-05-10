<?php

namespace Database\Factories\Profiles;

use App\Models\Enums\MaintenanceCategory;
use App\Models\Enums\ServiceProviderProfileStatus;
use App\Models\Profiles\ServiceProviderProfile;
use App\Models\User;
use App\Services\Invitation\ServiceProviderInvitationService;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class ServiceProviderProfileFactory extends Factory
{
    protected $model = ServiceProviderProfile::class;

    public function definition(): array
    {
        $min = fake()->randomFloat(2, 2_000, 8_000);

        return [
            'user_id' => User::factory(),
            'status' => ServiceProviderProfileStatus::Active->value,
            'specialties' => fake()->randomElements(
                array_map(fn ($c) => $c->value, MaintenanceCategory::cases()),
                fake()->numberBetween(1, 3),
            ),
            'service_areas' => fake()->randomElements(
                ['Dakar', 'Thiès', 'Mbour', 'Saint-Louis', 'Kaolack', 'Ziguinchor'],
                fake()->numberBetween(1, 3),
            ),
            'insurance_policy_id' => 'INS-'.strtoupper(Str::random(8)),
            'certifications' => null,
            'hourly_rate_min' => $min,
            'hourly_rate_max' => $min + fake()->randomFloat(2, 1_000, 6_000),
            'active_until' => fake()->optional(0.5)->dateTimeBetween('+6 months', '+3 years')?->format('Y-m-d'),
            'metadata' => null,
        ];
    }

    /**
     * TCK-260 — draft profile (no User attached yet, status = draft).
     * Mirror la forme produite par
     * {@see ServiceProviderInvitationService::invite()}.
     */
    public function draft(): self
    {
        return $this->state([
            'user_id' => null,
            'status' => ServiceProviderProfileStatus::Draft->value,
            'insurance_policy_id' => null,
            'hourly_rate_min' => null,
            'hourly_rate_max' => null,
            'active_until' => null,
            'metadata' => [
                'email' => fake()->unique()->safeEmail(),
                'first_name' => fake()->firstName(),
                'last_name' => fake()->lastName(),
                'phone' => fake()->e164PhoneNumber(),
                'trades' => ['plumbing'],
                'intervention_zones' => ['Dakar'],
            ],
        ]);
    }
}
