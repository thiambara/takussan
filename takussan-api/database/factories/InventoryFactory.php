<?php

namespace Database\Factories;

use App\Models\Customer;
use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Inventory;
use App\Models\Lease;
use App\Models\Property;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

class InventoryFactory extends Factory
{
    protected $model = Inventory::class;

    public function definition(): array
    {
        return [
            'lease_id' => Lease::factory(),
            'property_id' => Property::factory(),
            'type' => InventoryType::MoveIn,
            'conducted_by' => User::factory(),
            'tenant_id' => Customer::factory(),
            'conducted_at' => now(),
            'status' => InventoryStatus::Draft,
            'general_condition' => InventoryCondition::Good,
            'rooms' => [
                ['name' => 'Living room', 'condition' => 'good', 'notes' => null],
                ['name' => 'Kitchen', 'condition' => 'good', 'notes' => null],
            ],
        ];
    }

    public function moveOut(): static
    {
        return $this->state(['type' => InventoryType::MoveOut]);
    }

    public function pendingSignature(): static
    {
        return $this->state(['status' => InventoryStatus::PendingSignature]);
    }

    public function signed(): static
    {
        return $this->state([
            'status' => InventoryStatus::Signed,
            'tenant_signed' => true,
            'tenant_signed_at' => now(),
            'tenant_signature_data' => 'data:image/png;base64,'.base64_encode('tenant-sig'),
            'tenant_signature_hash' => hash('sha256', 'tenant-sig'),
            'owner_signed' => true,
            'owner_signed_at' => now(),
            'owner_signature_data' => 'data:image/png;base64,'.base64_encode('owner-sig'),
            'owner_signature_hash' => hash('sha256', 'owner-sig'),
            'signed_at' => now(),
        ]);
    }
}
