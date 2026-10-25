<?php

namespace Database\Seeders\Crm;

use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\UserCustomerRelationship;
use Database\Seeders\Support\SeedingContext;
use Illuminate\Database\Seeder;

class UserCustomerRelationshipSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->equipe($agency->id);
            if ($agents->isEmpty()) {
                continue;
            }

            foreach ($customers as $customer) {
                // L'agent qui a saisi le client le suit (TCK-2378).
                $primaryAgent = $customer->added_by_id ?? $this->ctx->agentAu($agency->id, $customer->created_at);
                $startedAt = $customer->created_at;

                UserCustomerRelationship::updateOrCreate(
                    [
                        'user_id' => $primaryAgent,
                        'customer_id' => $customer->id,
                        'relationship_type' => RelationshipType::AgentClient->value,
                    ],
                    [
                        'status' => RelationshipStatus::Active->value,
                        'is_primary' => true,
                        'started_at' => $startedAt->toDateString(),
                        'created_at' => $startedAt,
                        'updated_at' => $startedAt,
                    ],
                );
            }
        }
    }
}
