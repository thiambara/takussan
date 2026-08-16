<?php

namespace Database\Factories;

use App\Models\Agency;
use App\Models\AgencyRole;
use App\Models\AgencyRoleCapability;
use App\Models\Enums\AgencyRoleBaseType;
use App\Models\Enums\Capability;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AgencyRole>
 */
class AgencyRoleFactory extends Factory
{
    protected $model = AgencyRole::class;

    /**
     * @return array<string,mixed>
     */
    public function definition(): array
    {
        return [
            'agency_id' => Agency::factory(),
            // Unique : la contrainte `(agency_id, name)` est stricte, et une
            // suite qui fabrique dix rôles dans la même agence la heurterait.
            'name' => 'Rôle '.$this->faker->unique()->numerify('####'),
            'base_profile_type' => AgencyRoleBaseType::Agent->value,
            'description' => null,
            'is_system' => false,
            'is_clonable' => true,
        ];
    }

    public function system(): static
    {
        return $this->state(fn (): array => ['is_system' => true]);
    }

    public function ofType(AgencyRoleBaseType $type): static
    {
        return $this->state(fn (): array => ['base_profile_type' => $type->value]);
    }

    /**
     * @param  array<int,Capability>  $capabilities
     */
    public function withCapabilities(array $capabilities): static
    {
        return $this->afterCreating(function (AgencyRole $role) use ($capabilities): void {
            foreach ($capabilities as $capability) {
                AgencyRoleCapability::query()->create([
                    'agency_role_id' => $role->id,
                    'capability' => $capability->value,
                ]);
            }
            $role->refresh();
        });
    }
}
