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
    /**
     * TCK-1239 (P109.04) — de vrais PNG d'un pixel, de deux couleurs : un PDF d'état des lieux
     * signé par la fabrique imprime ses deux signatures, au lieu du texte `alt`. L'empreinte
     * suit `InventorySignatureService::sign()` (`sha256` de l'URI).
     */
    public const TENANT_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAADElEQVQImWMQlFAHAACOAFEaJ5bOAAAAAElFTkSuQmCC';

    public const OWNER_SIGNATURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAADElEQVQImWNYEWwEAALUAS6fYj/mAAAAAElFTkSuQmCC';

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
            'tenant_signature_data' => self::TENANT_SIGNATURE,
            'tenant_signature_hash' => hash('sha256', self::TENANT_SIGNATURE),
            'owner_signed' => true,
            'owner_signed_at' => now(),
            'owner_signature_data' => self::OWNER_SIGNATURE,
            'owner_signature_hash' => hash('sha256', self::OWNER_SIGNATURE),
            'signed_at' => now(),
        ]);
    }
}
