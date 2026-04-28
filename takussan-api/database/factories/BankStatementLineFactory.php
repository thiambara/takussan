<?php

namespace Database\Factories;

use App\Models\BankStatement;
use App\Models\BankStatementLine;
use App\Models\Enums\BankStatementLineDirection;
use App\Models\Enums\BankStatementLineMatchStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

class BankStatementLineFactory extends Factory
{
    protected $model = BankStatementLine::class;

    public function definition(): array
    {
        $amount = $this->faker->numberBetween(5000, 100000);

        return [
            'bank_statement_id' => BankStatement::factory(),
            'posted_at' => $this->faker->dateTimeBetween('-3 months', 'now'),
            'amount' => $amount,
            'direction' => $this->faker->randomElement(BankStatementLineDirection::cases()),
            'currency' => 'XOF',
            'label' => $this->faker->sentence(4),
            'reference' => $this->faker->boolean(70) ? $this->faker->bothify('REF-####-??') : null,
            'counterparty' => $this->faker->boolean(80) ? $this->faker->name() : null,
            'raw_payload' => [],
            'match_status' => BankStatementLineMatchStatus::Unmatched,
            'matched_payment_type' => null,
            'matched_payment_id' => null,
            'match_confidence' => null,
            'confirmed_at' => null,
            'confirmed_by' => null,
        ];
    }

    public function suggested(?string $paymentType = null, ?int $paymentId = null, int $confidence = 80): static
    {
        return $this->state([
            'match_status' => BankStatementLineMatchStatus::Suggested,
            'matched_payment_type' => $paymentType,
            'matched_payment_id' => $paymentId,
            'match_confidence' => $confidence,
        ]);
    }

    public function confirmed(?string $paymentType = null, ?int $paymentId = null): static
    {
        return $this->state([
            'match_status' => BankStatementLineMatchStatus::Confirmed,
            'matched_payment_type' => $paymentType,
            'matched_payment_id' => $paymentId,
            'confirmed_at' => now(),
        ]);
    }

    public function ignored(): static
    {
        return $this->state(['match_status' => BankStatementLineMatchStatus::Ignored]);
    }
}
