<?php

namespace Database\Factories;

use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-594 — une destination Wave non vérifiée ; `verified()` la rend utilisable pour verser.
 */
class PayoutMethodFactory extends Factory
{
    protected $model = PayoutMethod::class;

    public function definition(): array
    {
        $number = '+22177'.fake()->numerify('#######');

        return [
            'user_id' => User::factory(),
            'kind' => PayoutMethodKind::Wave,
            'account_identifier' => $number,
            'account_holder_name' => fake()->name(),
            'masked_identifier' => PayoutMethod::mask($number),
            'is_default' => true,
        ];
    }

    public function verified(): static
    {
        return $this->state(['verified_at' => now()]);
    }
}
