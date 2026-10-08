<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\PayoutMethodKind;
use App\Models\PayoutMethod;
use App\Models\PayoutMethodVerification;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * TCK-594 — une destination Wave non vérifiée ; `verifiedFor($agency)` la rend utilisable pour verser
 * depuis CETTE agence (VERIF-594 M-6 : la vérification vaut par agence).
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

    public function verifiedFor(Agency $agency, ?User $by = null, mixed $at = null): static
    {
        return $this->afterCreating(fn (PayoutMethod $method) => PayoutMethodVerification::query()->create([
            'agency_id' => $agency->id,
            'payout_method_id' => $method->id,
            'verified_by_id' => $by?->id,
            'verified_at' => $at ?? now(),
        ]));
    }
}
