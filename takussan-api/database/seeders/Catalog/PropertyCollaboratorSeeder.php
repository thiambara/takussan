<?php

namespace Database\Seeders\Catalog;

use App\Models\Enums\CollaboratorRole;
use App\Models\Profiles\AgentProfile;
use App\Models\Profiles\OwnerProfile;
use App\Models\Property;
use App\Models\PropertyCollaborator;
use App\Models\User;
use Database\Seeders\Support\SeedingContext;
use Database\Seeders\Support\Timeline;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

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

            $this->seedOwnerSideRoles($agency->id, $properties);
        }
    }

    /**
     * TCK-1478 (P86.05) — un `co_owner` et un `viewer` sur le premier bien de l'agence, pour que
     * l'écran des collaborateurs montre les quatre rôles en local. Éligibles par
     * `CollaboratorEligibleForProperty` : un bailleur de l'agence autre que le titulaire ; le
     * `viewer` prend un second bailleur, à défaut un agent puis un admin qui ne collabore pas déjà
     * au bien. Sans
     * part de commission (le grand livre ne sert que les `agent`), sans `accepted_at` (aucun
     * parcours ne l'écrit, D-66). `firstOrCreate` : une ligne déjà posée garde son rôle.
     *
     * @param  Collection<int, Property>  $properties
     */
    private function seedOwnerSideRoles(int $agencyId, Collection $properties): void
    {
        $property = $properties->first();
        if ($property === null) {
            return;
        }

        $taken = PropertyCollaborator::query()->where('property_id', $property->id)->pluck('user_id')
            ->push($property->user_id)->all();
        $owners = $this->ctx->usersWithProfile(OwnerProfile::class, $agencyId)
            ->reject(fn (User $u) => in_array($u->id, $taken, true))->values();
        $agents = $this->ctx->usersWithProfile(AgentProfile::class, $agencyId)
            ->reject(fn (User $u) => in_array($u->id, $taken, true))->values();

        $coOwner = $owners->first();
        $admins = ($this->ctx->usersByAgencyAndPersona[$agencyId]['admin'] ?? collect())
            ->reject(fn (User $u) => in_array($u->id, $taken, true))->values();
        $viewer = $owners->get(1) ?? $agents->first() ?? $admins->first();

        foreach ([[$coOwner, CollaboratorRole::CoOwner], [$viewer, CollaboratorRole::Viewer]] as [$user, $role]) {
            if ($user === null) {
                continue;
            }
            PropertyCollaborator::firstOrCreate(
                ['property_id' => $property->id, 'user_id' => $user->id],
                [
                    'role' => $role->value,
                    'commission_share' => null,
                    'invited_at' => $property->created_at,
                    'created_at' => $property->created_at,
                    'updated_at' => $property->created_at,
                ],
            );
        }
    }
}
