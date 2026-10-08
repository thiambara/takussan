<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\CommissionEntry;
use App\Models\Enums\CommissionEntryStatus;
use App\Models\Enums\CommissionOrigin;
use App\Models\Enums\Currency;
use App\Models\Lease;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class CommissionEntryFactory extends Factory
{
    protected $model = CommissionEntry::class;

    public function definition(): array
    {
        $base = fake()->numberBetween(100_000, 1_000_000);

        return [
            'agency_id' => Agency::factory(),
            'lease_id' => Lease::factory(),
            'beneficiary_id' => User::factory(),
            'origin' => CommissionOrigin::Negotiator,
            'base_amount' => $base,
            'share_percent' => 30,
            'amount' => round($base * 0.3, 2),
            'currency' => Currency::XOF,
            'status' => CommissionEntryStatus::Due,
            'earned_at' => now(),
        ];
    }
}
