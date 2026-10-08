<?php

namespace Database\Factories;

use App\Models\Enums\Currency;
use App\Models\Enums\ServiceProviderBillStatus;
use App\Models\MaintenanceRequest;
use App\Models\ServiceProviderBill;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * TCK-594 — une facture d'intervention reçue. `validated()` la rend payable et imputable en frais.
 */
class ServiceProviderBillFactory extends Factory
{
    protected $model = ServiceProviderBill::class;

    public function definition(): array
    {
        return [
            'maintenance_request_id' => MaintenanceRequest::factory(),
            'provider_id' => User::factory(),
            'reference_number' => 'SPB-'.strtoupper(Str::random(8)),
            'amount' => fake()->numberBetween(10_000, 300_000),
            'currency' => Currency::XOF,
            'exceeds_quote' => false,
            'status' => ServiceProviderBillStatus::PendingValidation,
            'rechargeable_to_landlord' => true,
        ];
    }

    public function validated(): static
    {
        return $this->state([
            'status' => ServiceProviderBillStatus::Validated,
            'validated_at' => now(),
        ]);
    }
}
