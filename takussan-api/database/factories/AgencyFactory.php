<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\AgencyKind;
use App\Models\Enums\AgencyStatus;
use App\Models\Enums\Currency;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class AgencyFactory extends Factory
{
    protected $model = Agency::class;

    public function definition(): array
    {
        $name = fake()->company();

        return [
            'name' => $name,
            'slug' => Str::slug($name).'-'.Str::random(5),
            'license_number' => strtoupper(Str::random(8)),
            'description' => fake()->sentence(),
            'email' => fake()->unique()->companyEmail(),
            'phone' => '+221'.fake()->numerify('33#######'),
            'website' => fake()->url(),
            'commission_rate' => fake()->randomFloat(2, 1, 15),
            'founded_at' => fake()->dateTimeBetween('-20 years', '-1 year')->format('Y-m-d'),
            'is_verified' => fake()->boolean(70),
            'verified_at' => fake()->optional()->dateTimeBetween('-2 years'),
            'status' => AgencyStatus::Active,
            'kind' => AgencyKind::Standard,
            'currency' => Currency::XOF,
        ];
    }

    public function individual(): static
    {
        return $this->state(fn () => ['kind' => AgencyKind::Individual]);
    }
}
