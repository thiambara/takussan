<?php

namespace Database\Factories\Profiles;

use App\Models\Agency;
use App\Models\Enums\IdType;
use App\Models\Enums\OwnerProfileStatus;
use App\Models\Profiles\OwnerProfile;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class OwnerProfileFactory extends Factory
{
    protected $model = OwnerProfile::class;

    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'agency_id' => Agency::factory(),
            'status' => OwnerProfileStatus::Active->value,
            'rib' => 'SN'.fake()->numerify('############################'),
            'tax_id' => strtoupper(fake()->bothify('NINEA-#######')),
            'id_document_type' => fake()->randomElement(IdType::cases())->value,
            'id_document_number' => strtoupper(fake()->bothify('??########')),
            'monthly_income' => fake()->randomFloat(2, 150_000, 2_000_000),
            'employer' => fake()->company(),
            'guarantor_user_id' => null,
            'metadata' => null,
        ];
    }

    public function inactive(): self
    {
        return $this->state(['status' => OwnerProfileStatus::Inactive->value]);
    }

    public function blocked(): self
    {
        return $this->state(['status' => OwnerProfileStatus::Blocked->value]);
    }
}
