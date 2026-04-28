<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\BankStatement;
use App\Models\Enums\BankStatementSourceFormat;
use App\Models\Enums\BankStatementStatus;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class BankStatementFactory extends Factory
{
    protected $model = BankStatement::class;

    public function definition(): array
    {
        return [
            'agency_id' => Agency::factory(),
            'uploaded_by' => User::factory(),
            'source_format' => $this->faker->randomElement(BankStatementSourceFormat::cases()),
            'file_hash' => $this->faker->sha256(),
            'bank_name' => $this->faker->company(),
            'account_iban_masked' => 'SN12 **** **** **42',
            'period_start' => $this->faker->dateTimeBetween('-3 months', '-1 month'),
            'period_end' => $this->faker->dateTimeBetween('-1 month', 'now'),
            'lines_count' => $this->faker->numberBetween(5, 50),
            'status' => BankStatementStatus::ReadyForReview,
            'finalized_at' => null,
            'finalized_by' => null,
        ];
    }

    public function processing(): static
    {
        return $this->state(['status' => BankStatementStatus::Processing]);
    }

    public function readyForReview(): static
    {
        return $this->state(['status' => BankStatementStatus::ReadyForReview]);
    }

    public function reconciled(): static
    {
        return $this->state([
            'status' => BankStatementStatus::Reconciled,
            'finalized_at' => now(),
        ]);
    }
}
