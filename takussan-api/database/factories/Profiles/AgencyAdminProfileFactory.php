<?php

namespace Database\Factories\Profiles;

use App\Models\Agency;
use App\Models\Enums\AgencyAdminProfileStatus;
use App\Models\Profiles\AgencyAdminProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class AgencyAdminProfileFactory extends Factory
{
    protected $model = AgencyAdminProfile::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'agency_id' => Agency::factory(),
            'status' => AgencyAdminProfileStatus::Active->value,
            'metadata' => null,
        ];
    }

    public function suspended(): self
    {
        return $this->state(['status' => AgencyAdminProfileStatus::Suspended->value]);
    }

    public function archived(): self
    {
        return $this->state(['status' => AgencyAdminProfileStatus::Archived->value]);
    }
}
