<?php

namespace Database\Seeders\Activity;

use App\Models\Enums\InventoryCondition;
use App\Models\Enums\InventoryStatus;
use App\Models\Enums\InventoryType;
use App\Models\Enums\LeaseStatus;
use App\Models\Enums\UserType;
use App\Models\Inventory;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

class InventorySeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->leases as $lease) {
            if ($lease->status === LeaseStatus::Draft) {
                continue;
            }

            $agents = $this->ctx->usersOfType($lease->agency_id, UserType::Agent->value);
            $conductedBy = $agents->isNotEmpty()
                ? $agents->pluck('id')->values()->random()
                : $lease->landlord_id;

            Inventory::create([
                'lease_id' => $lease->id,
                'property_id' => $lease->property_id,
                'type' => InventoryType::MoveIn->value,
                'conducted_by' => $conductedBy,
                'tenant_id' => $lease->tenant_id,
                'conducted_at' => $lease->start_date,
                'status' => InventoryStatus::Signed->value,
                'general_condition' => InventoryCondition::Good->value,
                'rooms' => [
                    ['name' => 'Salon', 'condition' => 'good', 'notes' => null],
                    ['name' => 'Cuisine', 'condition' => 'good', 'notes' => null],
                    ['name' => 'Chambre principale', 'condition' => 'good', 'notes' => null],
                    ['name' => 'Salle de bain', 'condition' => 'fair', 'notes' => 'Joints à revoir'],
                ],
                'tenant_signed' => true,
                'tenant_signed_at' => $lease->start_date,
                'owner_signed' => true,
                'owner_signed_at' => $lease->start_date,
                'created_at' => $lease->start_date,
                'updated_at' => $lease->start_date,
            ]);

            if ($lease->status === LeaseStatus::Terminated && $lease->terminated_at) {
                Inventory::create([
                    'lease_id' => $lease->id,
                    'property_id' => $lease->property_id,
                    'type' => InventoryType::MoveOut->value,
                    'conducted_by' => $conductedBy,
                    'tenant_id' => $lease->tenant_id,
                    'conducted_at' => $lease->terminated_at,
                    'status' => InventoryStatus::Signed->value,
                    'general_condition' => InventoryCondition::Fair->value,
                    'rooms' => [
                        ['name' => 'Salon', 'condition' => 'fair', 'notes' => 'Traces de frottement'],
                        ['name' => 'Cuisine', 'condition' => 'good', 'notes' => null],
                        ['name' => 'Chambre principale', 'condition' => 'fair', 'notes' => null],
                        ['name' => 'Salle de bain', 'condition' => 'good', 'notes' => null],
                    ],
                    'tenant_signed' => true,
                    'tenant_signed_at' => $lease->terminated_at,
                    'owner_signed' => true,
                    'owner_signed_at' => $lease->terminated_at,
                    'created_at' => $lease->terminated_at,
                    'updated_at' => $lease->terminated_at,
                ]);
            }
        }
    }
}
