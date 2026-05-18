<?php

namespace Database\Factories\Profiles;

use App\Models\Enums\PlatformProfileLevel;
use App\Models\Profiles\PlatformProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class PlatformProfileFactory extends Factory
{
    protected $model = PlatformProfile::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'level' => PlatformProfileLevel::Viewer->value,
            'granted_by_id' => null,
            'granted_at' => now(),
            'revoked_at' => null,
            'notes' => null,
        ];
    }

    public function superAdmin(): self
    {
        return $this->state(['level' => PlatformProfileLevel::SuperAdmin->value]);
    }

    public function support(): self
    {
        return $this->state(['level' => PlatformProfileLevel::Support->value]);
    }

    public function revoked(): self
    {
        return $this->state(['revoked_at' => now()]);
    }
}
