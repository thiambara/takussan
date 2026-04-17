<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\Currency;
use App\Models\Enums\InvoiceStatus;
use App\Models\Invoice;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

class InvoiceFactory extends Factory
{
    protected $model = Invoice::class;

    public function definition(): array
    {
        $subtotal = fake()->numberBetween(50_000, 2_000_000);
        $taxRate = 0;
        $taxAmount = 0;

        return [
            'customer_id' => Customer::factory(),
            'issued_by_id' => null,
            'agency_id' => null,
            'reference_number' => 'INV-'.strtoupper(Str::random(8)),
            'status' => InvoiceStatus::Draft,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(30)->toDateString(),
            'subtotal' => $subtotal,
            'tax_rate' => $taxRate,
            'tax_amount' => $taxAmount,
            'total_amount' => $subtotal + $taxAmount,
            'currency' => Currency::XOF,
        ];
    }

    public function sent(): static
    {
        return $this->state(['status' => InvoiceStatus::Sent]);
    }

    public function paid(): static
    {
        return $this->state(['status' => InvoiceStatus::Paid]);
    }
}
