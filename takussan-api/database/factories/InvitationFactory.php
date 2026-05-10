<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\InvitationStatus;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Invitation>
 */
class InvitationFactory extends Factory
{
    protected $model = Invitation::class;

    public function definition(): array
    {
        return [
            'token' => Str::random(64),
            'email' => fake()->unique()->safeEmail(),
            'invited_user_id' => null,
            'invited_by' => User::factory(),
            'invitable_type' => null,
            'invitable_id' => null,
            'agency_id' => Agency::factory(),
            'role' => 'agent',
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->addDays(7),
            'metadata' => null,
        ];
    }

    public function expired(): self
    {
        return $this->state(fn () => [
            'status' => InvitationStatus::Sent->value,
            'expires_at' => now()->subHour(),
        ]);
    }

    public function accepted(): self
    {
        return $this->state(fn () => [
            'status' => InvitationStatus::Accepted->value,
            'accepted_at' => now(),
        ]);
    }

    public function revoked(): self
    {
        return $this->state(fn () => [
            'status' => InvitationStatus::Revoked->value,
            'revoked_at' => now(),
        ]);
    }
}
