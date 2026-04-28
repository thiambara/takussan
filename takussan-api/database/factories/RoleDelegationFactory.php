<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\RoleDelegationStatus;
use App\Models\RoleDelegation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RoleDelegation>
 */
class RoleDelegationFactory extends Factory
{
    protected $model = RoleDelegation::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'delegator_id' => User::factory(),
            'agency_id' => Agency::factory(),
            'role' => 'agent',
            'starts_at' => null,
            'ends_at' => now()->addWeek(),
            'status' => RoleDelegationStatus::Active,
            'reason' => fake()->optional()->sentence(),
            'user_native_roles_snapshot' => [],
            'activated_at' => now(),
            'expired_at' => null,
            'revoked_at' => null,
            'revoked_by' => null,
        ];
    }

    public function scheduled(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RoleDelegationStatus::Scheduled,
            'starts_at' => now()->addDay(),
            'activated_at' => null,
        ]);
    }

    public function expired(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RoleDelegationStatus::Expired,
            'ends_at' => now()->subDay(),
            'expired_at' => now()->subDay(),
        ]);
    }

    public function revoked(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => RoleDelegationStatus::Revoked,
            'revoked_at' => now(),
            'revoked_by' => User::factory(),
        ]);
    }

    public function forRole(string $role): static
    {
        return $this->state(fn (array $attributes) => [
            'role' => $role,
        ]);
    }
}
