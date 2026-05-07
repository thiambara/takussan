<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\Enums\PlatformPayoutStatus;
use App\Models\PlatformPayout;
use Illuminate\Database\Eloquent\Factories\Factory;

class PlatformPayoutFactory extends Factory
{
    protected $model = PlatformPayout::class;

    public function definition(): array
    {
        $start = now()->startOfMonth();

        return [
            'agency_id' => Agency::factory(),
            'period_start' => $start->toDateString(),
            'period_end' => $start->copy()->endOfMonth()->toDateString(),
            'gross_amount' => 1_000_000,
            'platform_fee_amount' => 50_000,
            'net_amount' => 950_000,
            'currency' => 'XOF',
            'status' => PlatformPayoutStatus::Pending,
        ];
    }

    public function approved(): static
    {
        return $this->state(['status' => PlatformPayoutStatus::Approved]);
    }

    public function paid(): static
    {
        return $this->state([
            'status' => PlatformPayoutStatus::Paid,
            'processed_at' => now(),
        ]);
    }
}
