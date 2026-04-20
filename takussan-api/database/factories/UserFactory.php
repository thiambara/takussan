<?php

namespace Database\Factories;

use App\Models\Enums\UserStatus;
use App\Models\Enums\UserType;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'username' => fake()->unique()->userName(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'type' => UserType::Individual,
            'status' => UserStatus::Active,
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'phone' => '+221'.fake()->numerify('7########'),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            'preferred_language' => 'fr',
            'timezone' => 'Africa/Dakar',
        ];
    }

    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }

    public function agent(): static
    {
        return $this->state(['type' => UserType::Agent]);
    }

    public function admin(): static
    {
        return $this->state(['type' => UserType::Admin]);
    }
}
