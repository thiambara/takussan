<?php

namespace Database\Seeders\Catalog;

use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\AgentProfile;
use App\Models\PropertyCollaborator;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;

class PropertyCollaboratorSeeder extends Seeder
{
    public function __construct(private readonly SeedingContext $ctx) {}

    public function run(): void
    {
        foreach ($this->ctx->agencies as $agency) {
            $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agency->id);
            if ($agents->isEmpty()) {
                continue;
            }

            $agentIds = $agents->pluck('id')->values();
            $properties = $this->ctx->propertiesByAgency[$agency->id] ?? collect();

            foreach ($properties as $property) {
                // ~40% of properties get at least one collaborating agent.
                if (! $this->ctx->faker()->boolean(40)) {
                    continue;
                }

                $invitedAt = Timeline::randomDateBetween(
                    $property->created_at,
                    Timeline::seedEnd(),
                );

                $pickedAgentIds = $agentIds->random(min(2, $agentIds->count()));
                foreach ((array) $pickedAgentIds->toArray() as $agentId) {
                    PropertyCollaborator::updateOrCreate(
                        [
                            'property_id' => $property->id,
                            'user_id' => $agentId,
                        ],
                        [
                            'role' => $this->ctx->faker()->randomElement([
                                CollaboratorRole::Agent->value,
                                CollaboratorRole::Manager->value,
                            ]),
                            'commission_share' => $this->ctx->faker()->randomFloat(2, 10, 50),
                            'invited_at' => $invitedAt,
                            'accepted_at' => $invitedAt->addDays(random_int(0, 3)),
                            'created_at' => $invitedAt,
                            'updated_at' => $invitedAt,
                        ],
                    );
                }
            }
        }
    }
}
