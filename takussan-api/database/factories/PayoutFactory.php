<?php

namespace Database\Factories;

use App\Models\Enums\Currency;
use App\Models\Enums\PayoutStatus;
use App\Models\Payout;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class PayoutFactory extends Factory
{
    protected $model = Payout::class;

    public function definition(): array
    {
        $gross = fake()->numberBetween(100_000, 3_000_000);
        $commission = (int) round($gross * 0.1);
        $net = $gross - $commission;

        return [
            'landlord_id' => User::factory(),
            'reference_number' => 'PO-'.strtoupper(Str::random(8)),
            'status' => PayoutStatus::Pending,
            'gross_amount' => $gross,
            'commission_amount' => $commission,
            'net_amount' => $net,
            'currency' => Currency::XOF,
        ];
    }

    public function scheduled(): static
    {
        return $this->state([
            'status' => PayoutStatus::Scheduled,
            'scheduled_at' => now()->addDays(3),
        ]);
    }

    public function completed(): static
    {
        return $this->state([
            'status' => PayoutStatus::Completed,
            'processed_at' => now(),
        ]);
    }
}
