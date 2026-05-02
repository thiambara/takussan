<?php

namespace Database\Seeders\Crm;

use App\Models\Enums\RelationshipStatus;
use App\Models\Enums\RelationshipType;
use App\Models\Profiles\AgentProfile;
use App\Models\UserCustomerRelationship;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class UserCustomerRelationshipSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $customers = $this->ctx->customersByAgency[$agency->id] ?? collect();
            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);
            if ($agents->isEmpty()) {
                continue;
            }

            $agentIds = $agents->pluck('id')->values();

            foreach ($customers as $customer) {
                $primaryAgent = $agentIds->random();
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

                // ~20% of customers also have a secondary broker relationship.
                if ($this->ctx->faker()->boolean(20)) {
                    $secondary = $agentIds->reject(fn ($id) => $id === $primaryAgent)->random();
                    UserCustomerRelationship::updateOrCreate(
                        [
                            'user_id' => $secondary,
                            'customer_id' => $customer->id,
                            'relationship_type' => RelationshipType::BrokerClient->value,
                        ],
                        [
                            'status' => RelationshipStatus::Active->value,
                            'is_primary' => false,
                            'started_at' => Timeline::randomDateBetween($startedAt, Timeline::seedEnd())->toDateString(),
                            'created_at' => $startedAt,
                            'updated_at' => $startedAt,
                        ],
                    );
                }
            }
        }
    }
}
